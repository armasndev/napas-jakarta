import json
from pathlib import Path

from app.data import load_documents, load_measurements
from app.rag import answer

ROOT = Path(__file__).parents[1]


def test_retrieval_artifact_and_application_default_agree():
    artifact = json.loads((ROOT / "evaluation/results/retrieval_results.json").read_text())
    winner = max(artifact["results"], key=lambda row: (row["mrr_at_5"], row["hit_rate_at_5"]))[
        "mode"
    ]
    result = answer(
        "What does an ISPU value of 125 mean?",
        load_documents(ROOT / "data/docs"),
        load_measurements(ROOT / "data/demo/measurements.csv"),
    )
    assert winner == "hybrid"
    assert result["retrieval_mode"] == winner
    assert len(artifact["corpus_sha256"]) == 64


def test_chunking_artifact_has_all_variants():
    rows = json.loads((ROOT / "evaluation/results/chunking_results.json").read_text())
    assert {row["chunker"] for row in rows} == {"fixed", "structure", "semantic"}


def test_retrieval_plot_is_committed_artifact():
    assert (ROOT / "evaluation/results/retrieval_plot.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def test_retrieval_seed_set_has_planned_size_and_review_marker():
    rows = [
        json.loads(line)
        for line in (ROOT / "evaluation/ground_truth.jsonl").read_text().splitlines()
    ]
    assert len(rows) == 150
    assert {row["review_status"] for row in rows} == {"seeded_pending_human_review"}


def test_monitoring_dashboard_has_measurement_freshness_query():
    dashboard = json.loads((ROOT / "grafana/provisioning/dashboards/napas.json").read_text())
    assert len(dashboard["panels"]) >= 8
    queries = [
        target["rawSql"] for panel in dashboard["panels"] for target in panel.get("targets", [])
    ]
    assert any("measurements" in query and "age_seconds" in query for query in queries)
    titles = {panel["title"] for panel in dashboard["panels"]}
    assert "Tokens and cost by route" in titles
    assert "Multi-source answer rate" in titles


def test_tool_artifact_reports_required_quality_slices():
    result = json.loads((ROOT / "evaluation/results/tool_results.json").read_text())
    assert result["cases"] == 50
    for key in (
        "argument_accuracy",
        "numeric_consistency",
        "metadata_completeness",
        "staleness_detection",
        "missing_data_not_zero",
    ):
        assert result[key] == 1.0
    assert result["unsupported_calculation_rejected"] is True
    assert result["route_latency_ms_p50"] >= 0
    assert result["route_latency_ms_p95"] >= result["route_latency_ms_p50"]
    assert result["latest_tool_latency_ms_p50"] >= 0


def test_abstention_artifact_covers_safety_and_out_of_domain():
    result = json.loads((ROOT / "evaluation/results/abstention_results.json").read_text())
    assert result["cases"] == 18
    assert result["route_accuracy"] == 1.0
    assert result["contract_valid_rate"] == 1.0


def test_conversation_artifact_covers_follow_up_resolution():
    result = json.loads((ROOT / "evaluation/results/conversation_results.json").read_text())
    assert result["cases"] >= 25
    assert result["resolution_accuracy"] == 1.0
    assert result["route_accuracy"] == 1.0


def test_ingestion_artifact_proves_idempotency_and_validation():
    result = json.loads((ROOT / "evaluation/results/ingestion_results.json").read_text())
    assert result["runs"] == 2
    assert result["idempotent_fingerprint"] is True
    assert result["validation"]["accepted"] == 5
    assert result["validation"]["errors"] == {
        "duplicate_keys": 0,
        "invalid_units": 0,
        "negative_values": 0,
        "future_timestamps": 0,
    }


def test_ingestion_evaluation_is_offline_even_with_live_source_configured(monkeypatch):
    from evaluation import eval_ingestion

    monkeypatch.setenv("SOURCE_DATA_URL", "https://example.invalid/live")
    result = eval_ingestion.evaluate()
    assert result["idempotent_fingerprint"] is True
    assert result["first_counts"]["measurements"] == 5
    assert __import__("os").environ["SOURCE_DATA_URL"] == "https://example.invalid/live"


def test_compose_forwards_live_source_and_provider_settings():
    compose = (ROOT / "docker-compose.yml").read_text()
    assert compose.count("SOURCE_DATA_URL: ${SOURCE_DATA_URL:-}") >= 4
    assert "OPENAI_BASE_URL: ${OPENAI_BASE_URL:-}" in compose
    assert "http://localhost:6333/healthz" in (ROOT / "Makefile").read_text()


def test_baseline_migration_has_anonymous_session_id():
    schema = (ROOT / "migrations/versions/0001_baseline.py").read_text()
    assert "session_id TEXT" in schema
    assert "interaction_id TEXT" in schema
    assert "feedback_comment TEXT" in schema
