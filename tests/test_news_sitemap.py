from datetime import UTC, datetime

from ingestion.news import parse_feed


def test_news_sitemap_is_parsed_like_a_feed():
    xml = (
        b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        b'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
        b"<url><loc>https://www.thejakartapost.com/indonesia/2026/10/31/a-story</loc><news:news>"
        b"<news:publication_date>2026-10-31T17:43:07+07:00</news:publication_date>"
        b"<news:title>Haze reaches Jakarta</news:title></news:news></url>"
        b"<url><loc>https://evil.example/x</loc><news:news><news:publication_date>2026-10-31T17:00:00+07:00"
        b"</news:publication_date><news:title>Off domain</news:title></news:news></url></urlset>"
    )
    out = parse_feed(xml, {"thejakartapost.com"}, datetime(2026, 10, 31, 12, tzinfo=UTC))
    assert [e["title"] for e in out] == ["Haze reaches Jakarta"]
    assert out[0]["excerpt"] == ""


def test_section_sitemap_takes_date_and_headline_from_the_link():
    xml = (
        b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        b"<url><loc>https://www.thejakartapost.com/indonesia/2026/10/28/haze-disrupts-schooling-threatens-learning-outcomes</loc></url>"
        b"<url><loc>https://www.thejakartapost.com/indonesia</loc></url></urlset>"
    )
    out = parse_feed(xml, {"thejakartapost.com"}, datetime(2026, 10, 31, 12, tzinfo=UTC))
    assert [e["title"] for e in out] == ["Haze disrupts schooling threatens learning outcomes"]
    assert out[0]["published_at"].date().isoformat() == "2026-10-28"
