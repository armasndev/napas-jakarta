import assert from "node:assert/strict";
import test from "node:test";
import { getSuggestedQuestions } from "./suggestions.ts";

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
