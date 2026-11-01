import assert from "node:assert/strict";
import test from "node:test";
import {
  getContextFallbackSuggestions,
  getPairSuggestions,
  getSuggestedQuestions,
  sanitizeGeneratedSuggestions,
  suggestionPlan,
} from "./suggestions.ts";

const protectTopic = {
  label: "Protect yourself on a bad-air day",
  suggestedQuestion: "How can I reduce my exposure on a bad-air day?",
};

test("suggestions change when a station is selected or cleared", () => {
  const withoutStation = getSuggestedQuestions(undefined, undefined);
  const withStation = getSuggestedQuestions(undefined, "Kelapa Gading");
  const stationCleared = getSuggestedQuestions(undefined, undefined);

  assert.notDeepEqual(withStation, withoutStation);
  assert.deepEqual(stationCleared, withoutStation);
  assert.ok(withStation.every((question) => question.includes("Kelapa Gading")));
});

test("suggestions change when a topic is selected and include its grounded question", () => {
  const withoutTopic = getSuggestedQuestions(undefined, "Kelapa Gading");
  const withTopic = getSuggestedQuestions(protectTopic, "Kelapa Gading");

  assert.notDeepEqual(withTopic, withoutTopic);
  assert.equal(withTopic[0], "At Kelapa Gading, how can I reduce my exposure on a bad-air day?");
  assert.ok(withTopic.every((question) => question.includes("Kelapa Gading")));
  assert.ok(withTopic.slice(1).every((question) => question.toLowerCase().includes(protectTopic.label.toLowerCase())));
});

test("Indonesian suggestions stay localized across station context", () => {
  const suggestions = getSuggestedQuestions(undefined, "Kelapa Gading", "id");

  assert.equal(suggestions[0], "Bagaimana kualitas udara terbaru di Kelapa Gading?");
  assert.ok(suggestions.every((question) => !question.includes("What") && !question.includes("How")));
});

test("premade questions cover zero, one and two stations; everything else is generated", () => {
  assert.equal(suggestionPlan({ attachmentCount: 0, stationCount: 0 }), "premade");
  assert.equal(suggestionPlan({ attachmentCount: 0, stationCount: 1 }), "premade");
  assert.equal(suggestionPlan({ attachmentCount: 0, stationCount: 2 }), "premade");
  assert.equal(suggestionPlan({ attachmentCount: 0, stationCount: 3 }), "generate");
  assert.equal(suggestionPlan({ attachmentCount: 1, stationCount: 0 }), "generate");
  assert.equal(suggestionPlan({ attachmentCount: 1, stationCount: 2 }), "generate");
});

test("two-station questions name both stations in both languages", () => {
  for (const language of ["en", "id"] as const) {
    const questions = getPairSuggestions("Kelapa Gading", "Jagakarsa", language);
    assert.equal(questions.length, 3);
    assert.ok(questions.every((q) => q.includes("Kelapa Gading") && q.includes("Jagakarsa")));
  }
  assert.equal(getContextFallbackSuggestions("id").length, 3);
});

test("generated suggestions are kept only when they are short plain questions", () => {
  const clean = sanitizeGeneratedSuggestions([
    "How does the Monas rally affect my commute?",
    "How does the Monas rally affect my commute?",
    "Visit https://evil.test now?",
    "Not a question",
    "Hi?",
    "x".repeat(200) + "?",
    42,
    "Is the air at Bundaran HI worse than at Kelapa Gading?",
    "What should I wear outside today?",
    "A fourth valid question about the air today?",
  ]);
  assert.deepEqual(clean, [
    "How does the Monas rally affect my commute?",
    "Is the air at Bundaran HI worse than at Kelapa Gading?",
    "What should I wear outside today?",
  ]);
  assert.deepEqual(sanitizeGeneratedSuggestions("nope"), []);
});
