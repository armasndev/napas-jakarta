from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path

from ingestion.chunking import structure_chunks

from .citations import citation_token, parse_citations
from .config import selected_retrieval_mode
from .data import (
    district_matches,
    latest_by_station,
    load_documents,
    load_measurements,
    summarize_district,
)
from .models import Document, Measurement, SearchResult
from .policy import get_policy_timeline
from .provider import generate_answer, generation_usage
from .retrieval import search
from .router import classify
from .tools import (
    compare_locations,
    freshness,
    get_historical_summary,
    get_latest_measurements,
    get_peak_measurement,
    get_unhealthy_day_count,
    latest_data_age_seconds,
    query_historical_occurrence,
)

_EMBEDDED_CITATION_RE = re.compile(r"\[[A-Za-z0-9_-]+(?:\s*§\s*[^\[\]]+?)?\]")


def rewrite_query(question: str, mode: str = "rules") -> str:
    if mode == "off":
        return question
    replacements = {
        "jaksel": "Jakarta Selatan",
        "jakpus": "Jakarta Pusat",
        "jakbar": "Jakarta Barat",
        "jakut": "Jakarta Utara",
        "jaktim": "Jakarta Timur",
        "north jakarta": "Jakarta Utara",
        "the north": "Jakarta Utara",
        "north": "Jakarta Utara",
        "south jakarta": "Jakarta Selatan",
        "the south": "Jakarta Selatan",
        "south": "Jakarta Selatan",
        "west jakarta": "Jakarta Barat",
        "the west": "Jakarta Barat",
        "east jakarta": "Jakarta Timur",
        "the east": "Jakarta Timur",
        "central jakarta": "Jakarta Pusat",
        "pm25": "PM2.5",
        "pm 2.5": "PM2.5",
    }
    result = question
    for source, target in replacements.items():
        result = re.sub(re.escape(source), target, result, flags=re.IGNORECASE)
    return result


def condense_followup(question: str, history: list[dict] | None = None) -> str:
    """Resolve minimal follow-ups without allowing history to override evidence."""
    # A natural follow-up can be longer than a few words (for example,
    # "How does that compare with the north?"). Keep the bound tight enough
    # to avoid rewriting a fully specified new question.
    if not history or len(question.split()) > 12:
        return question
    candidates = history
    # Some clients append the current user message before calling answer(); it
    # must not be mistaken for the preceding conversational turn.
    if (
        history
        and history[-1].get("role") == "user"
        and str(history[-1].get("content", "")).strip() == question.strip()
    ):
        candidates = history[:-1]
    previous = next(
        (item.get("content", "") for item in reversed(candidates) if item.get("role") == "user"), ""
    )
    # Hydrated clients retain assistant metadata and prose. If the user turn
    # was generic but the assistant named a district, preserve that entity for
    # a pronoun follow-up instead of silently falling back to Jakarta-wide data.
    if previous and _find_district(str(previous)) is None:
        assistant_district = next(
            (
                item.get("content", "")
                for item in reversed(candidates)
                if item.get("role") == "assistant"
                and _find_district(str(item.get("content", ""))) is not None
            ),
            "",
        )
        if assistant_district:
            previous = f"{previous}; {assistant_district}"
    followup_tokens = set(re.findall(r"[a-zA-ZÀ-ÿ]+", question.lower()))
    followup_markers = {
        "there",
        "that",
        "it",
        "sana",
        "itu",
        "about",
        "compare",
        "comparison",
        "what",
        "how",
        "and",
        "now",
        "is",
        "does",
        "would",
        "which",
        "are",
        "should",
        "child",
        "children",
        "individual",
        "individuals",
    }
    if previous and followup_tokens.intersection(followup_markers):
        return f"{previous}; follow-up: {question}"
    return question


def _find_district(question: str) -> str | None:
    districts = [
        "Jakarta Selatan",
        "Jakarta Pusat",
        "Jakarta Barat",
        "Jakarta Utara",
        "Jakarta Timur",
    ]
    lowered = question.lower()
    for district in districts:
        if district.lower() in lowered:
            return district
    return None


def _find_districts(question: str) -> list[str]:
    districts = [
        "Jakarta Selatan",
        "Jakarta Pusat",
        "Jakarta Barat",
        "Jakarta Utara",
        "Jakarta Timur",
    ]
    lowered = question.lower()
    return [district for district in districts if district.lower() in lowered]


def _historical_condition_spec(question: str) -> dict[str, object]:
    """Interpret a historical condition request into tool parameters."""
    lowered = question.casefold()
    pollutant = "PM10" if re.search(r"\bpm\s*10\b", lowered) else "PM2.5"
    categories = (
        ("very unhealthy", "Very unhealthy"),
        ("sangat tidak sehat", "Sangat tidak sehat"),
        ("unhealthy", "Unhealthy"),
        ("tidak sehat", "Tidak sehat"),
        ("moderate", "Moderate"),
        ("sedang", "Sedang"),
        ("hazardous", "Hazardous"),
        ("berbahaya", "Berbahaya"),
        ("good", "Good"),
        ("baik", "Baik"),
    )
    for needle, label in categories:
        if needle in lowered:
            return {
                "condition_kind": "category",
                "operator": None,
                "threshold_or_category": label,
                "pollutant": pollutant,
                "temporal_operation": "count"
                if any(term in lowered for term in ("how many", "count", "berapa"))
                else "first"
                if any(term in lowered for term in ("first", "earliest", "pertama"))
                else "most_recent",
            }
    numeric = re.search(
        r"(?:(?P<target>ispu|pm\s*2\.?5|pm25|pm10)\s*(?P<op>below|under|above|over|<=|>=|<|>)\s*(?P<value>\d+(?:\.\d+)?)|"
        r"(?P<op_reverse>below|under|above|over|<=|>=|<|>)\s*(?P<target_reverse>ispu|pm\s*2\.?5|pm25|pm10)\s*(?P<value_reverse>\d+(?:\.\d+)?))",
        lowered,
    )
    if numeric:
        target = numeric.group("target") or numeric.group("target_reverse")
        raw_operator = numeric.group("op") or numeric.group("op_reverse")
        raw_value = numeric.group("value") or numeric.group("value_reverse")
        operator = {
            "below": "<",
            "under": "<",
            "above": ">",
            "over": ">",
        }.get(raw_operator, raw_operator)
        return {
            "condition_kind": "concentration" if "pm" in target else "ispu",
            "operator": operator,
            "threshold_or_category": float(raw_value),
            "pollutant": "PM10" if "pm10" in target else "PM2.5",
            "temporal_operation": "count"
            if any(term in lowered for term in ("how many", "count", "berapa"))
            else "first"
            if any(term in lowered for term in ("first", "earliest", "pertama"))
            else "most_recent",
        }
    return {
        "condition_kind": "category",
        "operator": None,
        "threshold_or_category": "Good",
        "pollutant": pollutant,
        "temporal_operation": "most_recent",
    }


def validate_citations(text: str, source_ids: set[str]) -> list[str]:
    cited = [item["source_id"] for item in parse_citations(text)]
    return sorted({citation for citation in cited if citation not in source_ids})


def citation_complete(text: str, source_ids: set[str], context: str) -> bool:
    """Require at least one supplied citation when document context is used."""
    if not source_ids or not context.strip():
        return True
    return bool(parse_citations(text))


def _citation_validation(text: str, sources: list[dict], retrieved_ids: set[str]) -> dict:
    """Validate exact source/chunk/locator references after generation."""
    by_id = {str(item.get("id")): item for item in sources}
    parsed = parse_citations(text)
    orphaned = []
    legacy = []
    for item in parsed:
        source_id = str(item["source_id"])
        source = by_id.get(source_id)
        locator = item.get("locator")
        if source is None or source_id not in retrieved_ids:
            orphaned.append(source_id)
        elif not locator:
            legacy.append(source_id)
        elif str(source.get("locator", "")) != str(locator):
            orphaned.append(f"{source_id} § {locator}")
    return {
        "citations": parsed,
        "resolvable": not orphaned,
        "orphaned": sorted(set(orphaned)),
        "legacy_without_locator": sorted(set(legacy)),
        "count": len(parsed),
    }


def _exactify_citations(text: str, sources: list[dict]) -> str:
    """Upgrade legacy provider/fallback tokens to the retrieved locator."""
    by_id = {str(item.get("id")): item for item in sources}

    def replace(match: re.Match[str]) -> str:
        source_id = match.group(1)
        locator = match.group(2)
        source = by_id.get(source_id)
        if source is None or locator:
            return match.group(0)
        return citation_token(source_id, str(source.get("locator", "")))

    return re.sub(r"\[([A-Za-z0-9_-]+)(?:\s*§\s*([^\[\]]+?))?\]", replace, text)


def demo_response(question: str, context: str, language: str, route: str = "") -> str:
    """Useful deterministic answer when no paid provider key is configured."""
    lower = question.lower()
    if "ispu" in lower and any(token in lower for token in ("125", "arti", "mean", "what does")):
        if language == "Bahasa Indonesia":
            return (
                "ISPU 125 adalah indeks (tanpa satuan), bukan konsentrasi PM2.5. "
                "Dalam kategori demo Indonesia, nilai 101–200 berarti Tidak Sehat. [ispu]"
            )
        return (
            "ISPU 125 is a unitless index, not a PM2.5 concentration. "
            "In the Indonesian categories used here, 101–200 is Tidak Sehat (Unhealthy). [ispu]"
        )
    if "who" in lower and any(token in lower for token in ("law", "hukum", "legal")):
        return (
            "Pedoman kualitas udara WHO adalah rekomendasi berbasis kesehatan, bukan hukum Indonesia. [who-guidance]"
            if language == "Bahasa Indonesia"
            else "WHO air-quality guidelines are health-based recommendations, not Indonesian law. [who-guidance]"
        )
    if route == "exposure_reduction":
        if language == "Bahasa Indonesia":
            return (
                "**Yang dilakukan sekarang**\n1. Periksa ISPU, polutan, lokasi, dan waktu terbaru; "
                "tunda olahraga berat atau pindahkan ke tempat/waktu yang lebih bersih.\n"
                "2. Saat udara luar lebih buruk, tutup jendela dan gunakan ruang bersih dengan "
                "pembersih partikel ber-CADR sesuai ukuran ruang; kurangi asap rokok, memasak, "
                "dupa, dan lilin di dalam. Buka ventilasi ketika udara luar membaik.\n"
                "3. Respirator partikulat tersertifikasi yang pas dapat mengurangi PM2.5 dalam "
                "paparan singkat yang tak terhindarkan, tetapi tidak menyaring gas dan tidak "
                "menggantikan pengurangan emisi.\n\n**Batasan**\nFilter perlu aliran udara dan "
                "perawatan; WHO tidak merekomendasikan respirator sebagai perlindungan rutin populasi "
                "karena bukti manfaat kesehatan dunia nyata terbatas. Kondisi jantung/paru memerlukan "
                "nasihat klinisi. Gejala berat perlu pertolongan darurat. [bad-air-day-protection] [clean-air-room]"
            )
        return (
            "**What to do now**\n1. Check the latest ISPU, pollutant, station, and timestamp; "
            "delay strenuous exercise or move it to a cleaner time/place.\n2. When outdoor air "
            "is dirtier, close windows and use a room with a particle cleaner sized by CADR; "
            "control smoke, cooking, incense, and candles indoors. Ventilate when outdoor air improves.\n"
            "3. A well-fitted approved particulate respirator can reduce PM2.5 during short unavoidable "
            "exposure, but does not filter gases or replace emission controls.\n\n**Limits**\n"
            "Filters need airflow and maintenance; WHO does not recommend routine public respirator use "
            "because real-world health evidence is limited. People with heart/lung conditions should ask "
            "a clinician. Severe symptoms need urgent care. [bad-air-day-protection] [clean-air-room]"
        )
    if route == "policy_implementation":
        return (
            "**Rule on paper**\nPergub DKI 66/2020 is listed as in force and effective 24 December "
            "2020; national and DKI instruments have different legal force.\n\n"
            "**Implementation/evidence**\nDKI's 19 June 2024 statement describes emissions-inventory "
            "development, tighter mobile/stationary oversight, and requested cooperation with the "
            "agglomeration as work still being completed. Official CEMS reports show monitoring activity, "
            "but the reviewed public pages do not provide a complete denominator for vehicle coverage, "
            "inspections, or sanctions.\n\n**Why the gap persists**\nThose documented gaps, "
            "multiple authorities, and transported pollution are plausible constraints—not proof that one "
            "measure caused a reading.\n\n**What would improve it**\nPublish coverage/pass-fail/sanction "
            "data, audit tests and CEMS follow-up, coordinate the airshed, and evaluate dated emissions "
            "and health outcomes. [jakarta-policy-implementation] [jakarta-regulations] "
            "[jakarta-emission-testing] [jakarta-cems-monitoring] [jakarta-court-air-quality]"
        )
    if route == "individual_emission_reduction":
        return (
            "**Reduce emissions**\nUse public transport/shared trips where safe and feasible, avoid "
            "idling, maintain and test vehicles, and never burn household waste outdoors. Reduce indoor "
            "combustion and choose cleaner household energy where feasible.\n\n**Influence structural "
            "change**\nReport smoky vehicles, open burning, or suspected industrial violations with date, "
            "location, and evidence; ask for inspection coverage, pass/fail and sanction counts, CEMS data, "
            "budgets, and milestones; join calibrated community monitoring and public consultations. "
            "Individual protection and emission reduction are different; neither substitutes for enforcement. "
            "[individual-emission-actions]"
        )
    if route == "improvement_strategies":
        return (
            "**Priorities**\nNear-term enforcement should publish testing and inspection denominators and "
            "sanction follow-through; transport policy should target high-emitting vehicles and make public "
            "transport viable; industry/power policy should enforce permits and publish CEMS; Jakarta should "
            "coordinate the Greater Jakarta airshed; monitoring should publish calibrated, timestamped data; "
            "health protection should prioritize schools, outdoor workers, children, older adults, and people "
            "with heart/lung disease.\n\nThese are evidence-based options and evaluation requirements, not "
            "proof of a causal ranking. [policy-improvements-evidence]"
        )
    prefix = (
        "Mode fallback (provider tidak tersedia): berikut konteks dengan sumber.\n\n"
        if language == "Bahasa Indonesia"
        else "Fallback mode (provider unavailable): grounded context follows.\n\n"
    )
    return prefix + context


def _category_occurrence_response(result: dict, language: str) -> str:
    """Generic provider-unavailable rendering of a structured tool result."""
    category = result.get("category") or (
        f"{result.get('pollutant')} {result.get('operator')} {result.get('threshold')}"
    )
    condition_description = result.get("condition_description", category)
    start = result["coverage_start"] or "the beginning of the available data"
    end = result["coverage_end"] or "the end of the available data"
    operation = result.get("temporal_operation", "most_recent")
    if operation == "count":
        return (
            f"{result['qualifying_observations']} station observations matched {category} in "
            f"{result['district']} across the available coverage ({start} to {end}), from "
            f"{result['coverage_stations']} stations and {result['coverage_timestamps']} timestamps. "
            "This is a station-observation count, not a district-wide average. "
            "[jakarta-monitoring] [ispu]"
        )
    if not result["found"]:
        if language == "Bahasa Indonesia":
            return (
                f"Tidak ada observasi {category} yang ditemukan dalam cakupan tersedia "
                f"{start} sampai {end}: {result['coverage_observations']} observasi stasiun "
                f"dari {result['coverage_stations']} stasiun (0 observasi memenuhi ambang). "
                f"Dalam data ini, kondisi yang dicari adalah {condition_description}. Tambahan riwayat "
                f"observasi stasiun dengan timestamp dan ISPU diperlukan untuk mencari kejadian "
                f"yang lebih lama. [jakarta-monitoring] [ispu]"
            )
        return (
            f"No {category} observation was found within the available coverage from {start} "
            f"to {end}: {result['coverage_observations']} station observations from "
            f"{result['coverage_stations']} stations (0 qualifying observations). In this "
            f"data, the requested condition is {condition_description}. Older station observations with "
            f"timestamps and ISPU values would be needed to search further back. "
            f"[jakarta-monitoring] [ispu]"
        )
    display_unit = "µg/m³" if str(result["unit"]).lower() in {"ug/m3", "µg/m³"} else result["unit"]
    concentration = (
        f"{result['concentration']} {display_unit}"
        if result["concentration"] is not None
        else "raw concentration unavailable"
    )
    age_hours = (result["freshness"]["age_seconds"] / 3600) if result["freshness"] else None
    age_text = f"; age {age_hours:.1f} h" if age_hours is not None else ""
    if language == "Bahasa Indonesia":
        return (
            f"Observasi {category} terbaru di {result['district']} adalah {result['observed_at_wib']} "
            f"di {result['station']}: ISPU {result['ispu']} ({result['ispu_category']}), "
            f"PM2.5 {concentration}. Pada timestamp itu, {result['reported_stations_at_timestamp']} "
            f"stasiun melapor dan {result['qualifying_stations_at_timestamp']} memenuhi {category} "
            f"({condition_description}){age_text}. Ini observasi stasiun, bukan klaim seluruh distrik. "
            f"[jakarta-monitoring] [ispu]"
        )
    temporal_word = "first" if operation == "first" else "most recent"
    return (
        f"The {temporal_word} {category} station observation in {result['district']} was "
        f"{result['observed_at_wib']} at {result['station']}: ISPU {result['ispu']} "
        f"({result['ispu_category']}), PM2.5 {concentration}. At that timestamp, "
        f"{result['reported_stations_at_timestamp']} stations reported and "
        f"{result['qualifying_stations_at_timestamp']} met {category} ({condition_description})"
        f"{age_text}. This is a station observation, not a claim that the whole district was "
        f"in that condition. [jakarta-monitoring] [ispu]"
    )


def _tool_answer_preserves_facts(text: str, result: dict) -> bool:
    """Reject generated prose that contradicts critical calculated fields."""
    lowered = text.casefold()
    if not result.get("found"):
        required = (
            str(result.get("coverage_observations") or ""),
            str(result.get("coverage_stations") or ""),
            str(result.get("coverage_timestamps") or ""),
        )
        return any(term in lowered for term in ("no", "tidak ada", "not found")) and all(
            value and value in text for value in required
        )
    if result.get("temporal_operation") == "count":
        required = [
            str(result.get("qualifying_observations") or ""),
            str(result.get("coverage_stations") or ""),
            str(result.get("coverage_timestamps") or ""),
        ]
        return all(value and value in text for value in required)
    required = [
        str(result.get("district") or ""),
        str(result.get("station") or ""),
        str(result.get("ispu") or ""),
        str(result.get("coverage_stations") or ""),
        str(result.get("reported_stations_at_timestamp") or ""),
        str(result.get("qualifying_stations_at_timestamp") or ""),
    ]
    concentration = result.get("concentration")
    if concentration is not None:
        required.append(str(concentration))
    if not all(value and value in text for value in required):
        return False
    observed = str(result.get("observed_at_wib") or "")
    return not observed or observed in text


def _provider_delta_for_answer(
    on_delta: Callable[[str], None] | None,
    *,
    measurement_context: str,
    category_result: dict | None,
) -> Callable[[str], None] | None:
    """Expose native deltas only when no structured result needs validation.

    Tool-backed answers are generated into a server-side provider buffer and
    validated before the caller receives any answer text.  This prevents a
    contradicted draft from appearing briefly before the deterministic tool
    fallback replaces it.  Document-only RAG keeps the provider callback for
    genuine native streaming.
    """
    if measurement_context or category_result is not None:
        return None
    return on_delta


def _select_route_sources(
    results: list[SearchResult],
    documents: list[Document],
    route: str,
    query: str,
    limit: int = 5,
) -> list[SearchResult]:
    """Keep complementary evidence in context instead of one preferred hit."""
    preferred: dict[str, tuple[str, ...]] = {
        "pollution_causes": (
            "jakarta-causes",
            "jakarta-seasonal-exposure",
            "jakarta-sppu-official-status-2024",
        ),
        "regulation_current": (
            "jakarta-regulations",
            "who-guidance",
            "pp-22-2021-air-quality",
            "permen-lhk-8-2023-vehicle-emissions",
            "pergub-66-2020-vehicle-testing",
        ),
        "policy_history": ("jakarta-policy-status", "jakarta-regulations"),
        "policy_implementation": (
            "jakarta-policy-implementation",
            "jakarta-regulations",
            "jakarta-emission-testing",
            "jakarta-cems-monitoring",
            "jakarta-court-air-quality",
            "pp-22-2021-air-quality",
            "permen-lhk-13-2021-cems",
        ),
        "improvement_strategies": (
            "policy-improvements-evidence",
            "jakarta-improvements",
            "jakarta-sppu-official-status-2024",
        ),
        "exposure_reduction": (
            "bad-air-day-protection",
            "clean-air-room",
            "jakarta-seasonal-exposure",
            "who-personal-interventions-2024",
            "epa-air-cleaners-home-2026",
        ),
        "individual_emission_reduction": (
            "individual-emission-actions",
            "jakarta-policy-implementation",
        ),
        "most_recent_category": ("jakarta-monitoring", "ispu", "who-aqg-2021-extract"),
        "vertical_exposure": ("vertical-exposure",),
        "latest_measurements": ("jakarta-monitoring",),
        "historical_tool": ("jakarta-monitoring",),
    }.get(route, ())
    if route == "regulation_current" and not any(
        term in query.lower() for term in ("who", "guideline")
    ):
        preferred = tuple(item for item in preferred if item != "who-guidance")
    by_id = {document.document_id: document for document in documents}
    ranked = {item.document.document_id: item for item in results}
    selected: list[SearchResult] = []
    for document_id in preferred:
        item = ranked.get(document_id)
        if item is None and document_id in by_id:
            item = SearchResult(by_id[document_id], 0.0, len(selected) + 1, "route_preferred")
        if item is not None:
            selected.append(item)
    # Measurement answers should never acquire incidental policy/health prose
    # merely because a generic station query shares words with those documents.
    if route in {"latest_measurements", "historical_tool"}:
        return [
            SearchResult(item.document, item.score, rank, item.method)
            for rank, item in enumerate(selected[:limit], start=1)
        ]
    selected_ids = {entry.document.document_id for entry in selected}
    for item in results:
        if item.document.document_id not in selected_ids:
            selected.append(item)
            selected_ids.add(item.document.document_id)
    return [
        SearchResult(item.document, item.score, rank, item.method)
        for rank, item in enumerate(selected[:limit], start=1)
    ]


def answer(
    question: str,
    documents: list[Document],
    measurements: list[Measurement],
    retrieval_mode: str | None = None,
    rewrite_mode: str = "rules",
    language: str = "English",
    history: list[dict] | None = None,
    on_delta: Callable[[str], None] | None = None,
) -> dict:
    retrieval_mode = retrieval_mode or selected_retrieval_mode()
    condensed_question = condense_followup(question, history)
    query = rewrite_query(condensed_question, rewrite_mode)
    route = classify(query)
    district = _find_district(query)
    districts = _find_districts(query)
    measurement_context = ""
    category_result = None
    historical_spec = _historical_condition_spec(query) if route == "most_recent_category" else None
    if route == "most_recent_category":
        if district and historical_spec is not None:
            category_result = query_historical_occurrence(
                measurements,
                location=district,
                location_type="district",
                pollutant=str(historical_spec["pollutant"]),
                condition_kind=str(historical_spec["condition_kind"]),
                operator=historical_spec["operator"],
                threshold_or_category=historical_spec["threshold_or_category"],
                temporal_operation=str(historical_spec["temporal_operation"]),
            )
            measurement_context = (
                "Structured most-recent category occurrence/condition tool result (station observations; not a district aggregate): "
                + json.dumps(category_result, ensure_ascii=False)
                + "\n"
            )
    elif district and route != "historical_tool":
        try:
            summary = summarize_district(measurements, district)
            district_measurement = next(
                item
                for item in measurements
                if district_matches(item.district, district)
                and item.pollutant == "PM2.5"
                and item.observed_at.isoformat() == summary["latest_observed_at"]
            )
            measurement_context = (
                f"Structured measurement for {district}: {summary}. "
                f"Freshness: {freshness(district_measurement)}. "
                "This is an observation, not a medical diagnosis.\n"
            )
        except ValueError:
            measurement_context = f"No demo observation is available for {district}.\n"
    elif route == "historical_tool" and districts:
        observed_dates = [item.observed_at.date() for item in measurements]
        start, end = min(observed_dates), max(observed_dates)
        if len(districts) > 1 and ("compare" in query.lower() or "bandingkan" in query.lower()):
            tool_result = compare_locations(measurements, districts)
            measurement_context = (
                f"Deterministic comparison for {', '.join(districts)} "
                f"({start.isoformat()} to {end.isoformat()}): {json.dumps(tool_result)}\n"
            )
        elif any(
            term in query.lower()
            for term in ("unhealthy day", "unhealthy days", "hari tidak sehat")
        ):
            tool_result = get_unhealthy_day_count(measurements, districts[0], start, end)
            measurement_context = (
                f"Deterministic unhealthy-day calculation for {districts[0]} "
                f"({start.isoformat()} to {end.isoformat()}): {json.dumps(tool_result)}\n"
            )
        else:
            tool_result = get_historical_summary(measurements, districts[0], start, end)
            measurement_context = (
                f"Deterministic historical summary for {districts[0]} "
                f"({start.isoformat()} to {end.isoformat()}): {json.dumps(tool_result)}\n"
            )
    elif route == "historical_tool" and measurements:
        observed_dates = [item.observed_at.date() for item in measurements]
        start, end = min(observed_dates), max(observed_dates)
        if any(term in query.lower() for term in ("highest", "highest pm", "max", "tertinggi")):
            try:
                tool_result = get_peak_measurement(measurements, start, end)
                measurement_context = (
                    f"Deterministic peak measurement ({start.isoformat()} to {end.isoformat()}): "
                    f"{json.dumps(tool_result)}\n"
                )
            except ValueError:
                measurement_context = "No numeric observations are available for this period.\n"
        else:
            latest = get_latest_measurements(measurements)
            measurement_context = (
                f"Deterministic historical data availability ({start.isoformat()} to "
                f"{end.isoformat()}): {json.dumps({'observations': len(measurements), 'latest': latest, 'note': 'The demo snapshot contains only the displayed observation window; no unobserved dates are inferred.'})}\n"
            )
    elif route == "policy_history":
        policy_terms = {
            "erp": "pl2se-erp",
            "pl2se": "pl2se-erp",
            "road pricing": "pl2se-erp",
            "low emission": "lez-expansion",
            "lez": "lez-expansion",
            "emission test": "emission-testing-enforcement",
            "uji emisi": "emission-testing-enforcement",
        }
        key = next((value for term, value in policy_terms.items() if term in query.lower()), None)
        if key:
            try:
                measurement_context = (
                    "Deterministic policy timeline: "
                    + json.dumps(get_policy_timeline(key), ensure_ascii=False)
                    + "\n"
                )
            except ValueError:
                measurement_context = (
                    "No structured policy timeline is available for this instrument.\n"
                )
    elif any(
        word in query.lower() for word in ("terbaru", "sekarang", "current", "latest", "today")
    ):
        latest = latest_by_station(measurements)[:3]
        measurement_context = "Latest observations:\n" + "\n".join(
            f"- {item.station_name}: ISPU {item.ispu_value} ({item.ispu_category}), "
            f"PM2.5 {item.concentration} {item.concentration_unit}, "
            f"observed {item.observed_at.isoformat()}, "
            f"stale={freshness(item)['stale']}"
            for item in latest
        )
    retrieval_query = query
    route_terms = {
        "pollution_causes": "emissions sources transport industry coal construction burning season wind",
        "regulation_current": "law regulation legal instrument standard Permen PP Pergub effective status",
        "policy_history": "draft proposal ERP PL2SE LEZ pending enacted implementation reason",
        "policy_implementation": "implementation enforcement inspection compliance sanctions CEMS regional coordination court order budget evidence gap",
        "improvement_strategies": "strategy intervention enforcement transport industry power airshed monitoring health protection emissions reduction",
        "exposure_reduction": "bad air day personal protection respirator indoor filtration windows exercise vulnerable symptoms limits",
        "individual_emission_reduction": "public transport vehicle maintenance emissions testing open burning household choices contribution reporting monitoring accountability",
        "most_recent_category": "most recent Good Baik ISPU 50 category occurrence station timestamp history",
        "vertical_exposure": "high-rise ground level height street canyon rooftop ventilation",
    }
    # Route-specific terms improve precision as the corpus grows without
    # changing the user-visible rewritten question or citation contract.
    retrieval_query = f"{query} {route_terms.get(route, '')}".strip()
    # Do not retrieve unrelated corpus passages for an out-of-domain refusal;
    # this keeps the citation contract honest and avoids presenting incidental
    # matches as evidence for a question we do not support.
    results = [] if route == "out_of_domain" else search(retrieval_query, documents, retrieval_mode)
    if route == "most_recent_category" and not district:
        # A category occurrence is location-specific; do not invent a Jakarta
        # aggregate when the user omitted the district.
        results = []
    results = _select_route_sources(results, documents, route, query)
    if route == "safety_abstention" and not any(
        item.document.document_id == "health-disclaimer" for item in results
    ):
        disclaimer = next(
            (item for item in documents if item.document_id == "health-disclaimer"), None
        )
        if disclaimer is not None:
            results.append(SearchResult(disclaimer, 1.0, len(results) + 1, "safety_contract"))
    sources = []
    for item in results:
        # Retrieval remains document-level for compatibility, while citations
        # resolve to the best deterministic structural chunk within that
        # retrieved document.  This prevents a document-only hit from being
        # presented as support for an arbitrary paragraph.
        document_chunks = structure_chunks(item.document)
        best_chunk = max(
            document_chunks,
            key=lambda chunk: (
                sum(term in chunk.text.lower() for term in query.lower().split()),
                -len(chunk.text),
            ),
            default=None,
        )
        locator = best_chunk.locator if best_chunk else item.document.section
        sources.append(
            {
                "id": item.document.document_id,
                "source_id": item.document.source_id or item.document.document_id,
                "chunk_id": best_chunk.chunk_id
                if best_chunk
                else f"{item.document.document_id}:structure:0",
                "title": item.document.title,
                "publisher": item.document.publisher,
                "url": item.document.source_url,
                "score": round(item.score, 4),
                "excerpt": (best_chunk.text if best_chunk else item.document.text)[:500],
                "locator": locator,
                "heading_path": best_chunk.heading_path
                if best_chunk
                else item.document.heading_path,
                "page": best_chunk.page if best_chunk else item.document.page,
                "paragraph": best_chunk.paragraph if best_chunk else item.document.paragraph,
                "status": item.document.status,
                "effective_date": item.document.effective_date,
                "retrieved_rank": item.rank,
            }
        )
    context = measurement_context + "\n".join(
        f"[{item['id']} § {item['locator']}] {_EMBEDDED_CITATION_RE.sub('', item['excerpt'])}"
        for item in sources
    )
    structured_answer = bool(measurement_context) or category_result is not None
    provider_delta = _provider_delta_for_answer(
        on_delta,
        measurement_context=measurement_context,
        category_result=category_result,
    )
    if route == "safety_abstention":
        answer_text = (
            "Saya tidak dapat mendiagnosis gejala atau memprediksi dampak medis individu. "
            "Silakan hubungi tenaga kesehatan; saya hanya dapat menjelaskan data kualitas udara "
            "dan panduan kesehatan umum. [health-disclaimer]"
            if language == "Bahasa Indonesia"
            else (
                "I can’t diagnose symptoms or predict an individual medical outcome. "
                "Please contact a qualified clinician; I can only explain air-quality "
                "data and general public-health guidance. [health-disclaimer]"
            )
        )
    elif route == "out_of_domain":
        answer_text = (
            "Maaf, saya hanya dapat membantu tentang kualitas udara Jakarta, ISPU, polutan, "
            "stasiun pemantauan, dan panduan terkait."
            if language == "Bahasa Indonesia"
            else "I can help only with Jakarta air quality, ISPU, pollutants, monitoring stations, "
            "and related guidance."
        )
    elif route == "most_recent_category" and category_result is not None:
        generated = generate_answer(
            question, context, language, history=history, on_delta=provider_delta
        )
        answer_text = generated or _category_occurrence_response(category_result, language)
        if generated and not _tool_answer_preserves_facts(generated, category_result):
            answer_text = _category_occurrence_response(category_result, language)
    elif route == "most_recent_category":
        answer_text = (
            "Sebutkan kabupaten/kota atau distrik Jakarta yang ingin diperiksa; "
            "kategori Baik harus dicari dari observasi stasiun di lokasi tertentu."
            if language == "Bahasa Indonesia"
            else "Please name the Jakarta district to check; a Good occurrence must be found from station observations at a specific location."
        )
    else:
        answer_text = generate_answer(
            question, context, language, history=history, on_delta=provider_delta
        ) or demo_response(question, context, language, route)
    # Structured measurement/tool renderers retain the legacy compact token
    # for client compatibility; their adjacent ``citations`` objects still
    # carry the exact chunk locator.  Document answers are upgraded to the
    # readable exact-locator syntax before they reach clients.
    if not structured_answer:
        answer_text = _exactify_citations(answer_text, sources)
    ungrounded_citations = validate_citations(answer_text, {item["id"] for item in sources})
    citation_is_complete = citation_complete(answer_text, {item["id"] for item in sources}, context)
    citation_validation = _citation_validation(
        answer_text, sources, {item["id"] for item in sources}
    )
    citations = []
    for number, reference in enumerate(parse_citations(answer_text), start=1):
        source = next((item for item in sources if item["id"] == reference["source_id"]), None)
        if source is None:
            continue
        citations.append(
            {
                "claim_id": f"claim-{number}",
                "source_id": source["source_id"],
                "chunk_id": source["chunk_id"],
                "locator": reference["locator"] or source["locator"],
                "title": source["title"],
                "url": source["url"],
                "supporting_excerpt": source["excerpt"],
                "retrieval_score": source["score"],
            }
        )
    return {
        "question": question,
        "condensed_question": condensed_question,
        "rewritten_query": query,
        "answer": answer_text,
        "generation_usage": generation_usage(),
        "sources": sources,
        "citations": citations,
        "citation_validation": citation_validation,
        "measurement_context": measurement_context,
        "retrieval_mode": retrieval_mode,
        "rewrite_mode": rewrite_mode,
        "language": language,
        "route": route,
        "stream_policy": "buffered_structured" if structured_answer else "native_provider",
        "citation_grounded": not ungrounded_citations,
        "citation_complete": citation_is_complete,
        "contract_valid": not ungrounded_citations and citation_is_complete,
        "ungrounded_citations": ungrounded_citations,
        "data_age_seconds": latest_data_age_seconds(measurements),
        "conversation_state": {
            "district": district,
            "pollutant": "PM2.5" if "pm2" in query.lower() or "pm2.5" in query.lower() else None,
            "timeframe": "historical"
            if route in {"historical_tool", "most_recent_category"}
            else "current"
            if route == "latest_measurements"
            else None,
            "comparison_target": districts[1] if len(districts) > 1 else None,
        },
    }


def load_demo_state(data_dir: str | Path = "data") -> tuple[list[Document], list[Measurement]]:
    root = Path(data_dir)
    processed = root / "processed" / "measurements.csv"
    measurement_path = processed if processed.exists() else root / "demo" / "measurements.csv"
    return load_documents(root / "docs"), load_measurements(measurement_path)


def load_runtime_state(
    data_dir: str | Path = "data", dsn: str = ""
) -> tuple[list[Document], list[Measurement]]:
    """Load documents locally and prefer PostgreSQL observations when available."""
    documents, measurements = load_demo_state(data_dir)
    if dsn.strip():
        try:
            from .db import load_measurements_from_db

            stored = load_measurements_from_db(dsn)
            if stored:
                measurements = stored
        except (ImportError, OSError, RuntimeError):
            # A database outage must not prevent the offline demo from starting.
            pass
    return documents, measurements
