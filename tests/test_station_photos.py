from app.api import build_station_catalog
from app.stations import load_station_photos


def test_station_photos_are_optional_https_only_and_bounded(tmp_path):
    path = tmp_path / "photos.json"
    path.write_text(
        '{"_note": "x", "A": {"url": "https://img.example/a.jpg", "credit": "Photographer"},'
        ' "B": "https://img.example/b.jpg", "C": {"url": "http://insecure/c.jpg"},'
        ' "D": {"url": "javascript:alert(1)"}, "E": 5}'
    )
    photos = load_station_photos(path)
    assert set(photos) == {"A", "B"}
    assert photos["A"]["credit"] == "Photographer"
    assert photos["B"]["credit"] == ""
    assert load_station_photos(tmp_path / "missing.json") == {}


def test_catalog_carries_photo_url_only_for_stations_that_have_one(tmp_path):
    record = {"station_id": "A", "station": "A", "district": "x", "latitude": -6.2, "longitude": 106.8}
    other = dict(record, station_id="Z")
    photos = {"A": {"url": "https://img.example/a.jpg", "credit": "Photographer"}}
    catalog = build_station_catalog([record, other], [], "demo", photos)
    by_id = {row["id"]: row for row in catalog["stations"]}
    assert by_id["A"]["photo_url"] == "https://img.example/a.jpg"
    assert by_id["A"]["photo_credit"] == "Photographer"
    assert by_id["Z"]["photo_url"] is None
    assert by_id["Z"]["photo_credit"] is None
    # Without any photos configured the keys are still present, as null.
    assert build_station_catalog([record], [], "demo")["stations"][0]["photo_url"] is None
