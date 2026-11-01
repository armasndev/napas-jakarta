from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.news import NewsStore, cluster_events, load_timeline, query_timeline, resolve_refs

ROOT = Path(__file__).parents[1]
DEMO = ROOT / "data" / "demo" / "news_items.json"


def _store() -> NewsStore:
    return NewsStore("", DEMO)


def test_demo_feed_is_language_separated_and_marked_demo():
    store = _store()
    en = store.list_items("en")
    ids = store.list_items("id")
    assert en and ids
    assert {i["lang"] for i in en} == {"en"}
    assert {i["lang"] for i in ids} == {"id"}
    assert all(i["demo"] for i in en + ids)
    assert store.source_mode == "demo"


def test_events_cluster_reports_of_one_event_into_one_pin():
    pins = _store().events("en")
    rally = [p for p in pins if p["topic"] == "PROTEST"]
    assert len(rally) == 1
    assert rally[0]["reports"] == 2
    assert len(rally[0]["outlets"]) == 2


def _row(i, minutes_ago, **kw):
    now = datetime.now(UTC)
    base = {
        "id": i, "lang": "en", "outlet": "O", "title": "t", "topic": "PROTEST", "is_event": True,
        "lat": -6.17, "lng": 106.82, "status": "unknown",
        "published_at": (now - timedelta(minutes=minutes_ago)).isoformat(),
    }
    base.update(kw)
    return base


def test_event_expires_after_window_without_end_time():
    now = datetime.now(UTC)
    rows = [_row("old", 13 * 60), _row("new", 30)]
    assert [p["id"] for p in cluster_events(rows, "en", now)] == ["new"]


def test_explicit_end_time_overrides_report_window():
    now = datetime.now(UTC)
    future = (now + timedelta(hours=3)).isoformat()
    past = (now - timedelta(hours=1)).isoformat()
    rows = [_row("kept", 20 * 60, event_end=future), _row("gone", 30, event_end=past)]
    assert [p["id"] for p in cluster_events(rows, "en", now)] == ["kept"]


def test_status_over_hides_pin_and_conflicting_statuses_become_unknown():
    now = datetime.now(UTC)
    assert cluster_events([_row("a", 10, status="over")], "en", now) == []
    pins = cluster_events(
        [_row("a", 30, status="planned"), _row("b", 10, status="ongoing")], "en", now
    )
    assert pins[0]["status"] == "unknown"


def test_distinct_places_or_long_gaps_do_not_merge():
    now = datetime.now(UTC)
    rows = [_row("a", 10), _row("b", 20, lat=-6.30, lng=106.90)]
    assert len(cluster_events(rows, "en", now)) == 2
    # Same place, but reports more than the window apart stay separate events.
    future = (now + timedelta(hours=3)).isoformat()
    rows = [_row("a", 10), _row("b", 20 * 60, event_end=future)]
    assert len(cluster_events(rows, "en", now)) == 2


def test_search_is_scoped_to_language():
    store = _store()
    assert store.search("rally monas", "en")
    assert all(r["lang"] == "id" for r in store.search("unjuk rasa monas", "id"))
    assert store.search("rally", "id") == []


def test_resolve_refs_returns_stored_records_and_marks_missing_unavailable():
    store = _store()
    stations = [{"id": "DKI1", "name": "Bundaran HI", "district": "Central", "category": "Moderate",
                 "ispu": 80, "pm25": 25, "observed_at": "2026-10-30T06:00:00Z", "source": "DKI"}]
    refs = [
        {"kind": "article", "id": "demo-en-1"},
        {"kind": "station", "id": "DKI1"},
        {"kind": "article", "id": "demo-id-1"},  # wrong language feed
        {"kind": "article", "id": "demo-en-1"},  # duplicate
    ]
    out = resolve_refs(refs, store, "en", stations)
    assert [r["available"] for r in out] == [True, True, False]
    assert "Station observation" in out[1]["text"]
    assert all(len(r["text"]) <= 1_200 for r in out)


def test_resolve_caps_total_text_and_chip_count():
    store = _store()
    refs = [{"kind": "article", "id": f"demo-en-{n}"} for n in range(1, 7)]
    assert len(resolve_refs(refs, store, "en", [])) == 4


def test_timeline_loads_and_filters(tmp_path):
    path = tmp_path / "t.json"
    path.write_text(
        '[{"id":"a","date":"2020-01-02","category":"Policy","title_en":"Smog rule","summary_en":"x"},'
        '{"id":"b","date":"2021-03-04","category":"Protest","title_en":"March","summary_en":"y"},'
        '{"bad":1}]'
    )
    entries = load_timeline(path)
    assert [e["id"] for e in entries] == ["b", "a"]
    assert [e["id"] for e in query_timeline(entries, "en", category="policy")] == ["a"]
    assert [e["id"] for e in query_timeline(entries, "en", text="march")] == ["b"]
    assert [e["id"] for e in query_timeline(entries, "en", start="2021-01-01")] == ["b"]


def test_public_news_items_do_not_expose_the_internal_relevance_flag():
    item = _store().list_items("en")[0]
    assert "relevant" not in item
