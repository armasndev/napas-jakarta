from __future__ import annotations

import json
import os
import re
from datetime import UTC, date, datetime
from pathlib import Path
from time import perf_counter
from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, StrictStr, field_validator

from monitoring.analytics import load_dashboard
from monitoring.logging import log_feedback, log_interaction
from monitoring.structured import emit_exception, emit_log

from .aqi import station_pm25_aqi
from .config import build_metadata, selected_retrieval_mode
from .evidence import compare_study_findings, get_source_apportionment
from .policy import get_policy_status, get_policy_timeline
from .provenance import source_manifest
from .provider import selected_prompt_variant, selected_prompt_version
from .rag import answer
from .runtime_data import RuntimeRepository
from .security import (
    CHAT_RATE_LIMITER,
    TELEMETRY_RATE_LIMITER,
    enforce_rate_limit,
    require_internal_token,
)
from .stations import display_district_name, display_station_name, load_runtime_stations
from .tools import (
    compare_locations,
    compare_measurement_with_standard,
    get_historical_summary,
    get_latest_measurements,
    get_unhealthy_day_count,
    latest_data_age_seconds,
    search_guidance,
)

ROOT = Path(__file__).parents[1]
RUNTIME = RuntimeRepository(os.getenv("DATA_DIR", ROOT / "data"), os.getenv("POSTGRES_DSN", ""))
DOCUMENTS = RUNTIME.documents()
MEASUREMENTS = RUNTIME.measurements(force=True)
app = FastAPI(title="Napas Jakarta API", version=build_metadata()["app_version"])

_USER_INPUT_WORD_RE = re.compile(r"[\w]+(?:[.'’\-][\w]+)*", re.UNICODE)
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")
MAX_USER_INPUT_WORDS = 500
BoundedLocation = Annotated[StrictStr, Field(min_length=2, max_length=100)]
BoundedSourceId = Annotated[StrictStr, Field(min_length=1, max_length=120)]


@app.middleware("http")
async def structured_request_logging(request: Request, call_next):
    request_id = _request_id(request)
    request.state.request_id = request_id
    started = perf_counter()

    try:
        response = await call_next(request)
    except Exception as exc:
        is_chat_request = request.url.path == "/ask"
        emit_exception(
            "error",
            "request_failed",
            exc,
            request_id=request_id,
            route=request.url.path,
            method=request.method,
            http_status=500,
            critical=is_chat_request,
            alertable=is_chat_request,
        )
        raise

    status_code = response.status_code
    level = "error" if status_code >= 500 else "warn" if status_code >= 400 else "info"
    emit_log(
        level,
        "request_completed",
        request_id=request_id,
        route=request.url.path,
        method=request.method,
        http_status=status_code,
        status_class=f"{status_code // 100}xx",
        duration_ms=round((perf_counter() - started) * 1000, 2),
        critical=request.url.path == "/ask" and status_code >= 500,
        alertable=request.url.path == "/ask" and status_code >= 500,
    )
    response.headers["X-Request-ID"] = request_id
    return response


def _request_id(request: Request) -> str:
    candidate = request.headers.get("x-request-id", "").strip()
    return candidate if _REQUEST_ID_RE.fullmatch(candidate) else f"req-{uuid4()}"


def _request_id_from(request: Request | None) -> str | None:
    if request is None:
        return None
    state = getattr(request, "state", None)
    return getattr(state, "request_id", None)


def _public_station_category(
    category: object, ispu: object, freshness: object | None = None
) -> str:
    freshness_record = freshness if isinstance(freshness, dict) else {}
    freshness_status = str(freshness_record.get("status", "")).strip().lower()
    freshness_is_current = (
        freshness_record.get("stale") is False or freshness_status == "fresh"
    )
    # The catalog is a public presentation boundary. If the upstream row does
    # not carry an explicit freshness result, fail closed rather than allowing
    # a numeric value to look like a current reading.
    if (
        ispu is None
        or not isinstance(freshness, dict)
        or not freshness_is_current
    ):
        return "Stale / missing"
    normalized = str(category or "").strip().upper()
    if normalized in {"BAIK", "GOOD"}:
        return "Good"
    if normalized in {"SEDANG", "MODERATE"}:
        return "Moderate"
    if normalized in {
        "TIDAK SEHAT",
        "UNHEALTHY",
        "SANGAT TIDAK SEHAT",
        "VERY UNHEALTHY",
        "BERBAHAYA",
        "HAZARDOUS",
    }:
        return "Unhealthy"
    try:
        score = float(ispu)
    except (TypeError, ValueError):
        return "Stale / missing"
    if score <= 50:
        return "Good"
    if score <= 100:
        return "Moderate"
    return "Unhealthy"


def build_station_catalog(
    station_records: list[dict],
    latest_rows: list[dict],
    source_mode: str,
    aqi_by_station: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Join station coordinates with the latest observation for map consumers."""
    latest_by_id = {str(row["station_id"]): row for row in latest_rows}
    aqi_by_id = aqi_by_station or {}
    stations: list[dict[str, Any]] = []
    for record in station_records:
        station_id = str(record["station_id"])
        observation = latest_by_id.get(station_id)
        source = (observation or {}).get("source") or record.get("source") or ""
        source_url = (
            source if str(source).startswith(("http://", "https://")) else None
        )
        ispu = (observation or {}).get("ispu")
        category = _public_station_category(
            (observation or {}).get("category"),
            ispu,
            (observation or {}).get("freshness"),
        )
        station_aqi = aqi_by_id.get(station_id) or {}
        stations.append(
            {
                "id": station_id,
                "name": display_station_name(record.get("station") or (observation or {}).get("station")),
                "district": display_district_name(record.get("district") or (observation or {}).get("district")),
                "latitude": float(record["latitude"]),
                "longitude": float(record["longitude"]),
                "ispu": ispu,
                "pm25": (observation or {}).get("concentration"),
                "category": category,
                "observed_at": (observation or {}).get("observed_at"),
                "source": source,
                "source_url": source_url,
                "freshness": (observation or {}).get("freshness"),
                # US EPA PM2.5 AQI, derived from the trailing 24-hour mean.
                # Null when fewer than 18 hourly readings or the data is stale.
                "aqi": station_aqi.get("aqi"),
                "aqi_category": station_aqi.get("category"),
                "aqi_pm25_24h_mean": station_aqi.get("pm25_24h_mean"),
                "aqi_hours": station_aqi.get("hours"),
                "aqi_window_end": station_aqi.get("window_end"),
            }
        )

    reporting = [row for row in stations if row["category"] != "Stale / missing"]
    counts = {
        category: sum(row["category"] == category for row in stations)
        for category in ("Good", "Moderate", "Unhealthy", "Stale / missing")
    }
    newest = max(
        (row["observed_at"] for row in reporting if row["observed_at"]),
        default=None,
    )
    highest_ispu = max((float(row["ispu"]) for row in reporting), default=None)
    overall_category = "Stale / missing"
    if highest_ispu is not None:
        if highest_ispu <= 50:
            overall_category = "Good"
        elif highest_ispu <= 100:
            overall_category = "Moderate"
        else:
            overall_category = "Unhealthy"
    return {
        "contract_version": 1,
        "stations": stations,
        "summary": {
            "station_count": len(stations),
            "reporting_count": len(reporting),
            "good_count": counts["Good"],
            "moderate_count": counts["Moderate"],
            "unhealthy_count": counts["Unhealthy"],
            "stale_count": counts["Stale / missing"],
            "latest_observed_at": newest,
            "overall_category": overall_category,
            "source_mode": source_mode,
        },
    }


def refresh_runtime_measurements(force: bool = False) -> list:
    """Refresh the shared measurement list when a configured DB cache expires."""
    if RUNTIME.dsn:
        MEASUREMENTS[:] = RUNTIME.measurements(force=force)
    return MEASUREMENTS


def refresh_runtime_historical(force: bool = False) -> list[dict]:
    """Return historical city data, preferring the durable DB when configured."""
    return RUNTIME.historical(force=force)


def _runtime_provenance() -> dict[str, Any]:
    """Describe loaded runtime facts without relabelling packaged fallback data."""
    refresh_runtime_measurements()
    runtime_sources = sorted({item.source for item in MEASUREMENTS})
    newest = max(MEASUREMENTS, key=lambda item: item.observed_at, default=None)
    store = RUNTIME.last_measurement_source
    live_rows = any(not item.source.startswith("Udara Jakarta demo") for item in MEASUREMENTS)
    fallback_reason = None
    if store != "postgres":
        fallback_reason = (
            "PostgreSQL is not configured; packaged fallback data is loaded."
            if not RUNTIME.dsn
            else RUNTIME.last_database_error
            or "PostgreSQL has no measurement rows; packaged fallback data is loaded."
        )
    ingestion = None
    if RUNTIME.dsn:
        try:
            from .db import load_latest_ingestion_run

            ingestion = load_latest_ingestion_run(RUNTIME.dsn)
        except (ImportError, OSError, RuntimeError, ValueError):
            ingestion = None
    return {
        "mode": "live" if live_rows else "demo",
        "store": store,
        "measurement_rows": len(MEASUREMENTS),
        "measurement_sources": runtime_sources,
        "newest_observation_at": newest.observed_at.isoformat() if newest else None,
        "data_age_seconds": latest_data_age_seconds(MEASUREMENTS),
        "last_successful_ingestion": ingestion,
        "fallback_reason": fallback_reason,
    }


def _source_manifest() -> dict[str, Any]:
    manifest = source_manifest(os.getenv("DATA_DIR", ROOT / "data"))
    runtime = _runtime_provenance()
    return {
        "mode": runtime["mode"],
        "runtime": runtime,
        "packaged_fallback": manifest["packaged_fallback"],
        "sources": manifest["sources"],
        "structured_evidence": manifest["structured_evidence"],
    }


class HistoryMessage(BaseModel):
    """Only conversational roles are allowed back into the model context."""

    role: Literal["user", "assistant"]
    content: StrictStr = Field(min_length=1, max_length=8_000)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=8_000)
    retrieval_mode: Literal["bm25", "dense", "hybrid", "hybrid_rerank", "qdrant_hybrid"] = Field(
        default_factory=selected_retrieval_mode
    )
    rewrite_mode: Literal["off", "rules"] = "rules"
    language: Literal["English", "Bahasa Indonesia"] = "English"
    # The web client persists assistant citations/meta alongside string content.
    # HistoryMessage ignores those display-only fields while allowing only the
    # user/assistant roles into the model context.
    history: list[HistoryMessage] = Field(default_factory=list, max_length=12)
    session_id: str | None = Field(default=None, max_length=64)

    @field_validator("question")
    @classmethod
    def question_word_limit(cls, value: str) -> str:
        if len(_USER_INPUT_WORD_RE.findall(value)) > MAX_USER_INPUT_WORDS:
            raise ValueError(f"question must contain at most {MAX_USER_INPUT_WORDS} words")
        return value


class FeedbackRequest(BaseModel):
    interaction_id: str = Field(min_length=1, max_length=64)
    session_id: str | None = Field(default=None, max_length=128)
    feedback: str = Field(pattern="^(positive|negative)$")
    comment: str = Field(default="", max_length=500)


class ChatTelemetryRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    interaction_id: str = Field(min_length=1, max_length=128)
    question: str = Field(min_length=1, max_length=4000)
    answer: str = Field(min_length=1, max_length=20000)
    conversation_turn: int = Field(ge=1, le=100)
    history_messages: int = Field(ge=0, le=200)


class CompareRequest(BaseModel):
    locations: list[BoundedLocation] = Field(min_length=1, max_length=10)
    pollutant: str = "PM2.5"


class HistoryRequest(BaseModel):
    location: str = Field(min_length=2, max_length=100)
    start: date
    end: date
    pollutant: str = Field(default="PM2.5", min_length=2, max_length=20)


class StandardRequest(BaseModel):
    value: float = Field(ge=0, le=100000)
    pollutant: str = Field(default="PM2.5", min_length=2, max_length=20)


class StudyCompareRequest(BaseModel):
    source_ids: list[BoundedSourceId] = Field(default_factory=list, max_length=10)


class GuidanceSearchRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500)
    language: Literal["English", "Bahasa Indonesia"] = "English"
    retrieval_mode: Literal["bm25", "dense", "hybrid", "hybrid_rerank", "qdrant_hybrid"] = Field(
        default_factory=selected_retrieval_mode
    )
    top_k: int = Field(default=5, ge=1, le=8)
    source_ids: list[BoundedSourceId] = Field(default_factory=list, max_length=12)


@app.get("/health")
def health() -> dict[str, str | int | float | None]:
    refresh_runtime_measurements()
    runtime = _runtime_provenance()
    return {
        "status": "ok",
        "documents": len(DOCUMENTS),
        "measurements": len(MEASUREMENTS),
        "source_mode": runtime["mode"],
        "measurement_store": runtime["store"],
        "data_age_seconds": runtime["data_age_seconds"],
        "retrieval_mode": selected_retrieval_mode(),
        "prompt_variant": selected_prompt_variant(),
    }


@app.get("/version")
def version() -> dict[str, str]:
    """Return safe deploy metadata, never credentials or environment values."""
    return {
        **build_metadata(),
        "retrieval_mode": selected_retrieval_mode(),
        "prompt_variant": selected_prompt_variant(),
        "prompt_version": selected_prompt_version(),
    }


@app.get("/monitoring/summary", dependencies=[Depends(require_internal_token)])
def monitoring_summary(http_request: Request = None, days: int = 30) -> dict:
    """Return aggregate telemetry only; user-entered text is never exposed."""
    if http_request is not None:
        enforce_rate_limit(http_request, TELEMETRY_RATE_LIMITER, "monitoring-summary")
    return load_dashboard(days)


@app.get("/sources", dependencies=[Depends(require_internal_token)])
def sources() -> dict:
    return _source_manifest()


@app.get("/policies/timeline", dependencies=[Depends(require_internal_token)])
def policy_timeline(instrument: str) -> dict:
    try:
        return {"timeline": get_policy_timeline(instrument)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/policies/status", dependencies=[Depends(require_internal_token)])
def policy_status(instrument: str, as_of: str | None = None) -> dict:
    try:
        return {"status": get_policy_status(instrument, as_of)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/evidence/source-apportionment", dependencies=[Depends(require_internal_token)])
def source_apportionment(
    pollutant: str = "PM2.5", season: str | None = None, location: str | None = None
) -> dict:
    return {"findings": get_source_apportionment(pollutant, season, location)}


@app.post("/evidence/compare", dependencies=[Depends(require_internal_token)])
def evidence_compare(request: StudyCompareRequest) -> dict:
    return compare_study_findings(request.source_ids)


@app.post("/guidance/search", dependencies=[Depends(require_internal_token)])
def guidance_search(request: GuidanceSearchRequest) -> dict[str, Any]:
    return {
        "results": search_guidance(
            request.query,
            DOCUMENTS,
            language=request.language,
            retrieval_mode=request.retrieval_mode,
            top_k=request.top_k,
            source_ids=request.source_ids,
        ),
        "retrieval_mode": request.retrieval_mode,
        "source_mode": _source_manifest()["mode"],
    }


@app.get("/measurements/latest", dependencies=[Depends(require_internal_token)])
def latest_measurements(location: str | None = None, pollutant: str = "PM2.5") -> dict:
    refresh_runtime_measurements()
    return {
        "measurements": get_latest_measurements(MEASUREMENTS, location, pollutant),
        "source_mode": _source_manifest()["mode"],
    }


@app.get("/stations", dependencies=[Depends(require_internal_token)])
def stations(pollutant: str = "PM2.5") -> dict[str, Any]:
    """Return map-ready station metadata joined to the latest observation."""
    refresh_runtime_measurements()
    data_dir = RUNTIME.data_dir
    station_records = load_runtime_stations(
        path=data_dir / "demo" / "stations.csv",
        persisted_path=data_dir / "processed" / "stations.csv",
        source_url=os.getenv("SOURCE_DATA_URL", ""),
        prefer_persisted=True,
    )
    return build_station_catalog(
        station_records,
        get_latest_measurements(MEASUREMENTS, pollutant=pollutant),
        _source_manifest()["mode"],
        aqi_by_station=station_pm25_aqi(MEASUREMENTS, datetime.now(UTC)),
    )


@app.post("/measurements/compare", dependencies=[Depends(require_internal_token)])
def compare_measurements(request: CompareRequest) -> dict:
    refresh_runtime_measurements()
    return {
        "comparisons": compare_locations(MEASUREMENTS, request.locations, request.pollutant),
        "source_mode": _source_manifest()["mode"],
    }


@app.post("/measurements/history", dependencies=[Depends(require_internal_token)])
def historical_measurements(request: HistoryRequest) -> dict:
    refresh_runtime_measurements()
    if request.end < request.start:
        raise HTTPException(status_code=422, detail="end must not be before start")
    try:
        summary = get_historical_summary(
            MEASUREMENTS, request.location, request.start, request.end, request.pollutant
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"summary": summary, "source_mode": _source_manifest()["mode"]}


@app.post("/measurements/unhealthy-days", dependencies=[Depends(require_internal_token)])
def unhealthy_days(request: HistoryRequest) -> dict:
    refresh_runtime_measurements()
    if request.end < request.start:
        raise HTTPException(status_code=422, detail="end must not be before start")
    return {
        "summary": get_unhealthy_day_count(
            MEASUREMENTS, request.location, request.start, request.end
        ),
        "source_mode": _source_manifest()["mode"],
    }


@app.post("/measurements/standard", dependencies=[Depends(require_internal_token)])
def measurement_standard(request: StandardRequest) -> dict:
    try:
        comparison = compare_measurement_with_standard(request.value, request.pollutant)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"comparison": comparison}


@app.post("/ask", dependencies=[Depends(require_internal_token)])
def ask(request: AskRequest, http_request: Request = None) -> dict:
    if http_request is not None:
        enforce_rate_limit(http_request, CHAT_RATE_LIMITER, "ask")
    started = perf_counter()
    request_id = _request_id_from(http_request)
    session_id = request.session_id or f"api-{uuid4()}"
    history = [item.model_dump() for item in request.history]
    try:
        refresh_runtime_measurements()
        source_mode = _source_manifest()["mode"]
        result = answer(
            request.question,
            DOCUMENTS,
            MEASUREMENTS,
            retrieval_mode=request.retrieval_mode,
            rewrite_mode=request.rewrite_mode,
            language=request.language,
            history=history,
        )
    except ValueError as exc:
        emit_log(
            "warn",
            "chat_validation_rejected",
            request_id=request_id,
            route="/ask",
            http_status=422,
            error_type=type(exc).__name__,
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        emit_exception(
            "error",
            "chat_failure",
            exc,
            request_id=request_id,
            route="/ask",
            critical=True,
            alertable=True,
        )
        raise
    interaction_id = log_interaction(
        {
            "event": "answer",
            "session_id": session_id,
            "question": request.question,
            "rewritten_query": result["rewritten_query"],
            "route": result["route"],
            "retrieval_mode": result["retrieval_mode"],
            "citation_grounded": result["citation_grounded"],
            "citation_complete": result["citation_complete"],
            "prompt_version": selected_prompt_version(),
            "latency_ms": round((perf_counter() - started) * 1000, 2),
            "data_age_seconds": result["data_age_seconds"],
            "abstention_type": (
                "safety"
                if result["route"] == "safety_abstention"
                else "out_of_domain"
                if result["route"] == "out_of_domain"
                else None
            ),
            "source": source_mode,
            "conversation_turn": 1
                + sum(1 for item in history if item.get("role") == "user"),
            "history_messages": len(history),
            "history_summary_chars": 0,
            "provider_model": result.get("generation_usage", {}).get(
                "model", os.getenv("LLM_MODEL", "")
            ),
            "token_usage": result.get("generation_usage", {}).get("total_tokens"),
            "estimated_cost": result.get("generation_usage", {}).get("estimated_cost_usd"),
            "carried_entities": json.dumps(
                result.get("conversation_state", {}), ensure_ascii=False
            ),
            "source_count": len(result.get("sources", [])),
        }
    )
    return {
        "interaction_id": interaction_id,
        "session_id": session_id,
        "source_mode": source_mode,
        **result,
    }


@app.post("/feedback", dependencies=[Depends(require_internal_token)])
def feedback(request: FeedbackRequest, http_request: Request = None) -> dict[str, str]:
    if http_request is not None:
        enforce_rate_limit(http_request, TELEMETRY_RATE_LIMITER, "feedback")
    log_feedback(request.interaction_id, request.feedback, request.comment, request.session_id)
    return {"status": "recorded"}


@app.post("/chat-telemetry", dependencies=[Depends(require_internal_token)])
def chat_telemetry(
    request: ChatTelemetryRequest, http_request: Request = None
) -> dict[str, str]:
    if http_request is not None:
        enforce_rate_limit(http_request, TELEMETRY_RATE_LIMITER, "chat-telemetry")
    log_interaction(
        {
            "event": "answer",
            "interaction_id": request.interaction_id,
            "session_id": request.session_id,
            "question": request.question,
            "answer_text": request.answer,
            "conversation_turn": request.conversation_turn,
            "history_messages": request.history_messages,
            "source": "eve",
        }
    )
    return {"status": "recorded", "interaction_id": request.interaction_id}
