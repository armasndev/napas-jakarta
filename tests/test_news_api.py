import pytest
from fastapi.testclient import TestClient

from app import api


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("NAPAS_INTERNAL_TOKEN", "test-token")
    return TestClient(api.app, headers={"X-Napas-Internal-Token": "test-token"})


def test_news_routes_require_the_internal_token(monkeypatch):
    monkeypatch.setenv("NAPAS_INTERNAL_TOKEN", "test-token")
    anonymous = TestClient(api.app)
    for path in ("/news", "/events", "/timeline"):
        assert anonymous.get(path).status_code == 401
    assert anonymous.post("/context/resolve", json={"refs": []}).status_code == 401


def test_news_is_filtered_by_language(client):
    en = client.get("/news", params={"language": "en"}).json()
    ids = client.get("/news", params={"language": "id"}).json()
    assert {i["lang"] for i in en["items"]} == {"en"}
    assert {i["lang"] for i in ids["items"]} == {"id"}
    assert en["source_mode"] == "demo"
    # An unknown language falls back to English rather than leaking the other feed.
    assert {i["lang"] for i in client.get("/news", params={"language": "fr"}).json()["items"]} == {"en"}


def test_events_come_back_clustered_with_report_counts(client):
    events = client.get("/events", params={"language": "en"}).json()["events"]
    assert any(e["reports"] == 2 for e in events)
    assert all(e["lat"] and e["lng"] for e in events)


def test_news_search_and_unknown_item(client):
    result = client.post("/news/search", json={"query": "rally monas", "language": "en"}).json()
    assert result["results"] and result["results"][0]["lang"] == "en"
    assert client.get("/news/does-not-exist").status_code == 404
    assert client.post("/news/search", json={"query": "x"}).status_code == 422


def test_context_resolve_validates_refs_and_resolves_stations(client):
    ok = client.post("/context/resolve", json={
        "language": "en",
        "refs": [{"kind": "article", "id": "demo-en-1"}, {"kind": "article", "id": "gone"}],
    })
    assert ok.status_code == 200
    items = ok.json()["items"]
    assert [i["available"] for i in items] == [True, False]
    bad_kind = client.post("/context/resolve", json={"refs": [{"kind": "file", "id": "x"}]})
    assert bad_kind.status_code == 422
    bad_id = client.post("/context/resolve", json={"refs": [{"kind": "article", "id": "../etc"}]})
    assert bad_id.status_code == 422
    too_many = client.post("/context/resolve", json={
        "refs": [{"kind": "article", "id": f"a{i}"} for i in range(5)],
    })
    assert too_many.status_code == 422


def test_timeline_routes_return_curated_entries(client):
    listing = client.get("/timeline").json()
    assert listing["curated"] is True
    assert listing["entries"]
    query = client.post("/timeline/query", json={"category": "Policy"}).json()
    assert all(e["category"] == "Policy" for e in query["entries"])
