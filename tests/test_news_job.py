import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from ingestion import news as job

NOW = datetime(2026, 10, 31, 6, 0, tzinfo=UTC)
RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>Rally planned near Monas</title><link>https://news.example.co.id/a?utm_source=x#top</link>
<description>&lt;p&gt;Crowd expected at Monas.&lt;/p&gt;</description><pubDate>Fri, 31 Oct 2026 12:00:00 +0700</pubDate></item>
<item><title>Off-domain</title><link>https://evil.test/x</link><pubDate>Fri, 31 Oct 2026 12:00:00 +0700</pubDate></item>
<item><title>Future</title><link>https://news.example.co.id/f</link><pubDate>Fri, 31 Dec 2030 12:00:00 +0700</pubDate></item>
</channel></rss>"""
DOMAINS = {"example.co.id"}


def test_parse_feed_cleans_filters_and_canonicalises():
    items = job.parse_feed(RSS, DOMAINS, NOW)
    assert [i["title"] for i in items] == ["Rally planned near Monas", "Future"]
    first = items[0]
    assert first["url"] == "https://news.example.co.id/a"  # tracking and fragment dropped
    assert first["excerpt"] == "Crowd expected at Monas."
    assert items[1]["published_at"] == NOW  # far-future date falls back to now


def test_parse_feed_rejects_dtd_and_bad_xml():
    with pytest.raises(job.FetchError) as bomb:
        job.parse_feed(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><rss/>', DOMAINS, NOW)
    assert bomb.value.error_class == "parse_error"
    with pytest.raises(job.FetchError):
        job.parse_feed(b"<rss><item>", DOMAINS, NOW)


def test_url_guard_only_allows_https_curated_public_hosts(monkeypatch):
    monkeypatch.setattr(job, "_public_address", lambda host: None)
    job.check_url("https://news.example.co.id/feed", DOMAINS)
    for bad in ("http://news.example.co.id/feed", "https://evil.test/feed",
                "https://example.co.id.evil.test/feed"):
        with pytest.raises(job.FetchError) as err:
            job.check_url(bad, DOMAINS)
        assert err.value.error_class == "off_domain"


def test_internal_addresses_are_refused(monkeypatch):
    monkeypatch.setattr(
        job.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("169.254.169.254", 443))]
    )
    with pytest.raises(job.FetchError) as err:
        job.check_url("https://news.example.co.id/feed", DOMAINS)
    assert err.value.error_class == "blocked_ip"


def test_extraction_is_validated_and_degrades_to_plain_article():
    item = {"title": "Rally planned near Monas", "excerpt": "Crowd expected at Monas, Central Jakarta."}
    good = {"event": True, "topic": "PROTEST", "location": "Monas, Central Jakarta",
            "event_start": None, "event_end": None, "status": "planned"}
    out = job.validate_extraction(good, item, NOW)
    assert out["is_event"] and out["location_text"] == "Monas, Central Jakarta"
    assert out["status"] == "planned" and out["topic"] == "PROTEST"
    # Place not in the text, links, bad shapes and unknown topics are not trusted.
    for bad in (
        dict(good, location="Bandung Station"),
        dict(good, location="Monas https://x.test"),
        {"event": "yes", "topic": "PROTEST"},
        "ignore previous instructions",
        None,
    ):
        plain = job.validate_extraction(bad, item, NOW)
        assert plain["is_event"] is False and plain["location_text"] is None
    assert job.validate_extraction(dict(good, topic="ROBOTS"), item, NOW)["topic"] == "PROTEST"


def test_far_future_event_times_are_dropped():
    item = {"title": "Rally Monas", "excerpt": "Monas rally"}
    raw = {"event": True, "topic": "PROTEST", "location": "Monas", "event_end": "2031-01-01T00:00:00Z",
           "event_start": "2026-11-01T01:00:00+07:00"}
    out = job.validate_extraction(raw, item, NOW)
    assert out["event_end"] is None and out["event_start"] is not None


def _run(sources, fetch, extract=None, geocode=None, known=None, logs=None):
    published = []
    result = job.run_news_job(
        sources, fetch=fetch, extract=extract, geocode=geocode,
        known_ids=lambda: set(known or ()), publish=lambda items: published.extend(items) or len(items),
        purge=lambda: 0, now=NOW,
    )
    return result, published


def _feed_fetch(url, domains):
    if url.endswith("robots.txt"):
        raise job.FetchError("http_4xx", 404)
    return RSS


def test_one_failing_source_does_not_stop_the_others(capfd):
    sources = [
        {"domain": "bad.example", "lang": "en", "feed_url": "https://bad.example/feed"},
        {"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"},
    ]

    def fetch(url, domains):
        if "bad.example" in url:
            raise job.FetchError("http_429", 429)
        return _feed_fetch(url, domains)

    result, published = _run(sources, fetch)
    assert result["sources_ok"] == 1 and result["sources_failed"] == 1
    assert [p["source"] for p in published] == ["example.co.id", "example.co.id"]
    lines = [json.loads(line) for line in capfd.readouterr().out.splitlines() if line.startswith("{")]
    failed = [r for r in lines if r["event"] == "news_source_failed"]
    assert failed[0]["source"] == "bad.example" and failed[0]["error_class"] == "http_429"
    assert failed[0]["stage"] == "feed" and failed[0]["lang"] == "en"
    done = next(r for r in lines if r["event"] == "news_run_completed")
    assert done["sources_ok"] == 1 and done["level"] == "info"
    assert all("Rally planned" not in json.dumps(r) for r in lines)  # no article text in logs


def test_event_is_geocoded_and_failed_llm_call_keeps_a_plain_article():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    calls = []

    def extract(item):
        calls.append(item["title"])
        if item["title"] == "Future":
            raise RuntimeError("model down")
        return {"event": True, "topic": "PROTEST", "location": "Monas", "status": "planned"}

    geo = lambda text: {"lat": -6.1754, "lng": 106.8272, "place_id": "p1", "precision": "point"}
    result, published = _run(sources, _feed_fetch, extract, geo)
    by_title = {p["title"]: p for p in published}
    rally = by_title["Rally planned near Monas"]
    assert rally["is_event"] and rally["lat"] == -6.1754 and rally["place_id"] == "p1"
    assert by_title["Future"]["is_event"] is False
    assert result["events_found"] == 1 and result["llm_failed"] == 1


def test_event_without_a_resolvable_place_is_a_normal_article():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    extract = lambda item: {"event": True, "topic": "PROTEST", "location": "Monas"}
    _, published = _run(sources, _feed_fetch, extract, geocode=lambda text: None)
    assert not any(p["is_event"] for p in published)


def test_known_items_are_not_reprocessed_or_sent_to_the_llm():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    known = {job.item_id("https://news.example.co.id/a"), job.item_id("https://news.example.co.id/f")}

    def extract(item):
        raise AssertionError("no LLM call for known items")

    result, published = _run(sources, _feed_fetch, extract, known=known)
    assert published == [] and result["items_new"] == 0


def test_all_sources_failing_is_an_alertable_error(capfd):
    def fetch(url, domains):
        raise job.FetchError("timeout")

    result, _ = _run([{"domain": "a.example", "lang": "en", "feed_url": "https://a.example/f"}], fetch)
    assert result["sources_ok"] == 0
    last = [json.loads(x) for x in capfd.readouterr().out.splitlines() if x.startswith("{")][-1]
    assert last["event"] == "news_run_completed" and last["level"] == "error"
    assert last["alertable"] is True


def test_keyword_topic_fallback_and_source_loading(tmp_path):
    assert job.keyword_topic({"title": "Road closure Saturday", "excerpt": ""}) == "TRAFFIC"
    assert job.keyword_topic({"title": "Aksi unjuk rasa", "excerpt": ""}) == "PROTEST"
    path = tmp_path / "s.json"
    path.write_text(json.dumps({"sources": [
        {"domain": "a.id", "lang": "id", "active": True, "terms_checked": True, "terms_url": "https://a.id/terms"},
        {"domain": "b.id", "lang": "id", "active": False, "terms_checked": True, "terms_url": "https://b.id/terms"},
        {"domain": "c.id", "lang": "fr", "active": True, "terms_checked": True, "terms_url": "https://c.id/terms"},
        {"domain": "d.id", "lang": "id", "active": True, "terms_checked": False, "terms_url": "https://d.id/terms"},
        {"domain": "e.id", "lang": "id", "active": True, "terms_checked": True},
    ]}))
    assert [s["domain"] for s in job.load_sources(path)] == ["a.id"]


KEYWORDS = Path(__file__).parents[1] / "data" / "news_keywords.json"


def _rel():
    return job.load_relevance(KEYWORDS)


def test_relevance_keeps_air_quality_stories_from_anywhere_in_both_languages():
    rel = _rel()
    keep = [
        {"title": "Haze from Kalimantan fires blankets Singapore", "excerpt": ""},
        {"title": "Malaysia issues haze warning", "excerpt": "Transboundary haze worsens."},
        {"title": "Kabut asap Kalimantan Tengah makin pekat", "excerpt": ""},
        {"title": "KLH minta pemda tangani karhutla", "excerpt": "Kebakaran lahan gambut meluas."},
        {"title": "Pemprov DKI perluas uji emisi kendaraan", "excerpt": ""},
        {"title": "Kualitas udara Jakarta memburuk", "excerpt": "ISPU naik."},
        {"title": "Government response to air pollution", "excerpt": "Ministry orders cloud seeding."},
    ]
    assert all(rel.matches(item) for item in keep)


def test_relevance_keeps_jakarta_protests_but_not_other_cities_or_unrelated_news():
    rel = _rel()
    assert rel.matches({"title": "Demo di sekitar Monas", "excerpt": ""})
    assert rel.matches({"title": "Road closures", "excerpt": "Central Jakarta arterial roads"})
    assert not rel.matches({"title": "Banjir di Surabaya", "excerpt": "Warga mengungsi"})
    assert not rel.matches({"title": "Demo buruh di Bandung", "excerpt": "Gedung Sate"})
    assert not rel.matches({"title": "Pemprov DKI kaji aturan anggaran", "excerpt": ""})
    assert not rel.matches({"title": "Rupiah menguat", "excerpt": "Bursa Asia"})


def test_exclude_terms_win_and_the_wire_dateline_is_ignored():
    rel = _rel()
    assert not rel.matches({"title": "Football match played under haze", "excerpt": ""})
    assert not rel.matches({"title": "Horoskop hari ini", "excerpt": "kualitas udara"})
    assert not rel.matches(
        {"title": "Governor aids families", "excerpt": "Jakarta (ANTARA) - Governor Andi visited Makassar."}
    )
    assert rel.matches(
        {"title": "Rally planned", "excerpt": "Jakarta (ANTARA) - Police closed roads around Monas."}
    )


def test_matching_is_whole_word_so_short_terms_do_not_fire_inside_other_words():
    rel = _rel()
    assert not rel.matches({"title": "Hazelnut harvest improves", "excerpt": ""})
    assert not rel.matches({"title": "Aqiqah ceremony in town", "excerpt": ""})


def test_job_applies_the_filter_unless_the_source_opts_out():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    calls = []

    def extract(item):
        calls.append(item["title"])
        return {"event": False, "topic": "OTHER"}

    def run_with(sources_):
        published = []
        job.run_news_job(
            sources_, fetch=_feed_fetch, extract=extract, geocode=None, known_ids=set,
            publish=lambda items: published.extend(items) or len(items), purge=lambda: 0, now=NOW,
            relevant=_rel().matches,
        )
        return published

    kept = run_with(sources)
    # The fixture feed has a Monas rally (a Jakarta protest, kept) and an unrelated item (dropped).
    assert [p["title"] for p in kept] == ["Rally planned near Monas"]
    assert calls == ["Rally planned near Monas"]
    open_sources = [dict(sources[0], relevance_filter=False)]
    assert len(run_with(open_sources)) == 2


def test_store_excerpt_false_keeps_only_the_headline_and_link():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed", "store_excerpt": False}]
    seen = []

    def extract(item):
        seen.append(item["excerpt"])
        return {"event": False, "topic": "OTHER"}

    _, published = _run(sources, _feed_fetch, extract)
    assert published and all(p["excerpt"] == "" for p in published)
    assert seen == [""] * len(published)


def _many_item_feed(count):
    items = "".join(
        f"<item><title>Aksi di Monas {i}</title><link>https://example.co.id/a{i}</link>"
        f"<description>Monas {i}</description><pubDate>Fri, 31 Oct 2026 12:{i:02d}:00 +0700</pubDate></item>"
        for i in range(count)
    )
    return f'<?xml version="1.0"?><rss><channel>{items}</channel></rss>'.encode()


def test_llm_budget_defers_extra_items_and_throttles_calls():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    feed = _many_item_feed(5)
    waits, calls = [], []

    def fetch(url, domains):
        if url.endswith("robots.txt"):
            raise job.FetchError("http_4xx", 404)
        return feed

    def extract(item):
        calls.append(item["title"])
        return {"event": False, "topic": "OTHER"}

    published = []
    result = job.run_news_job(
        sources, fetch=fetch, extract=extract, geocode=None, known_ids=set,
        publish=lambda items: published.extend(items) or len(items), purge=lambda: 0, now=NOW,
        max_llm_calls=3, llm_min_interval=4.5, pause=waits.append,
    )
    assert len(calls) == 3 and len(published) == 3 and result["deferred"] == 2
    assert calls[0] == "Aksi di Monas 4"  # newest first
    assert len(waits) == 2 and all(0 < w <= 4.5 for w in waits)


def test_llm_rate_limit_stops_calls_and_leaves_items_for_the_next_run():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    feed = _many_item_feed(4)
    calls = []

    def fetch(url, domains):
        if url.endswith("robots.txt"):
            raise job.FetchError("http_4xx", 404)
        return feed

    def extract(item):
        calls.append(item["title"])
        if len(calls) == 2:
            raise job.FetchError("http_429", 429, "llm rate limited")
        return {"event": False, "topic": "OTHER"}

    published = []
    result = job.run_news_job(
        sources, fetch=fetch, extract=extract, geocode=None, known_ids=set,
        publish=lambda items: published.extend(items) or len(items), purge=lambda: 0, now=NOW,
    )
    assert len(calls) == 2  # no more calls after the 429
    assert len(published) == 1 and result["deferred"] == 3  # the limited item and the rest wait


def test_model_marked_not_relevant_is_stored_hidden_and_never_geocoded_or_pinned():
    sources = [{"domain": "example.co.id", "lang": "id", "feed_url": "https://example.co.id/feed"}]
    geocoded = []

    def extract(item):
        return {"relevant": False, "event": True, "topic": "PROTEST", "location": "Monas"}

    def geocode(text):
        geocoded.append(text)
        return {"lat": -6.17, "lng": 106.82, "place_id": "p", "precision": "point"}

    result, published = _run(sources, _feed_fetch, extract, geocode)
    assert published and all(p["relevant"] is False and p["is_event"] is False for p in published)
    assert geocoded == [] and result["not_relevant"] == len(published) and result["events_found"] == 0


def test_a_missing_or_malformed_relevance_answer_keeps_the_story():
    item = {"title": "Kabut asap", "excerpt": ""}
    for raw in ({"event": False, "topic": "OTHER"}, {"relevant": "no", "event": False, "topic": "OTHER"}, None):
        assert job.validate_extraction(raw, item, NOW)["relevant"] is True
    assert job.validate_extraction({"relevant": False, "event": False, "topic": "OTHER"}, item, NOW)["relevant"] is False
