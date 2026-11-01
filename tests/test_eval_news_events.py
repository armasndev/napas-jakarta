from evaluation.eval_news_events import load_cases, run, score


def test_cases_cover_both_languages_events_and_non_events():
    cases = load_cases()
    assert len(cases) >= 20
    assert {c["lang"] for c in cases} == {"en", "id"}
    assert any(c["is_event"] for c in cases) and any(not c["is_event"] for c in cases)
    assert all(c["place_contains"] for c in cases if c["is_event"])
    assert any(c["relevant"] for c in cases) and any(not c["relevant"] for c in cases)
    assert all(c["relevant"] for c in cases if c["is_event"])  # an event is always relevant


def test_a_perfect_extractor_scores_one_and_an_empty_one_has_zero_recall():
    cases = load_cases()
    by_title = {c["title"]: c for c in cases}

    def perfect(item):
        case = by_title[item["title"]]
        return {
            "relevant": case["relevant"], "event": case["is_event"], "topic": case["topic"],
            "location": case["place_contains"] if case["is_event"] else None,
        }

    result = run(perfect, cases)
    assert result["all"]["relevance_recall"] == 1.0
    assert result["all"]["relevance_precision"] == 1.0
    assert result["all"]["event_recall"] == 1.0
    assert result["all"]["event_precision"] == 1.0
    assert result["all"]["place_match"] == 1.0
    assert result["all"]["topic_accuracy"] == 1.0
    assert set(result) == {"all", "en", "id"}

    never = run(lambda item: {"event": False, "topic": "OTHER"}, cases)
    assert never["all"]["event_recall"] == 0.0


def test_a_failing_extractor_is_scored_as_no_events_not_a_crash():
    def boom(item):
        raise RuntimeError("provider down")

    assert run(boom)["all"]["event_recall"] == 0.0


def test_score_flags_false_positives():
    cases = [
        {"lang": "en", "is_event": False, "place_contains": None, "topic": "OTHER"},
        {"lang": "en", "is_event": True, "place_contains": "Monas", "topic": "PROTEST"},
    ]
    predictions = [
        {"is_event": True, "location_text": "Monas", "topic": "OTHER"},
        {"is_event": True, "location_text": "Monas", "topic": "PROTEST"},
    ]
    assert score(cases, predictions)["all"]["event_precision"] == 0.5
