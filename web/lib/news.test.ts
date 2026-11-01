import assert from "node:assert/strict";
import test from "node:test";
import { addChip, chipKey, languageParam, parseChipDrop, type ContextChip } from "./news.ts";
import { formatNewsTime } from "./news-format.ts";

const chip = (id: string, kind: ContextChip["kind"] = "article"): ContextChip => ({ id, kind, sub: "s", title: `t ${id}` });

test("addChip adds, de-duplicates and stops at four", () => {
  let chips: readonly ContextChip[] = [];
  for (const id of ["a", "b", "c", "d"]) {
    const next = addChip(chips, chip(id));
    assert.equal(next.result, "added");
    chips = next.chips;
  }
  assert.equal(addChip(chips, chip("a")).result, "duplicate");
  assert.equal(addChip(chips, chip("e")).result, "limit");
  assert.equal(chips.length, 4);
});

test("the same id under a different kind is a different chip", () => {
  const first = addChip([], chip("x", "article")).chips;
  assert.equal(addChip(first, chip("x", "station")).result, "added");
  assert.notEqual(chipKey(chip("x", "article")), chipKey(chip("x", "station")));
});

test("parseChipDrop accepts only well-formed chips and bounds the text", () => {
  const ok = parseChipDrop(JSON.stringify({ id: "demo-en-1", kind: "article", sub: "s", title: "T".repeat(500) }));
  assert.equal(ok?.id, "demo-en-1");
  assert.equal(ok?.title.length, 200);
  assert.equal(parseChipDrop("not json"), undefined);
  assert.equal(parseChipDrop(JSON.stringify({ id: "x y", kind: "article", sub: "s", title: "t" })), undefined);
  assert.equal(parseChipDrop(JSON.stringify({ id: "x", kind: "file", sub: "s", title: "t" })), undefined);
  assert.equal(parseChipDrop(JSON.stringify({ id: "../x", kind: "article", sub: "s", title: "t" })), undefined);
});

test("languageParam defaults to English", () => {
  assert.equal(languageParam("id"), "id");
  assert.equal(languageParam("fr"), "en");
  assert.equal(languageParam(null), "en");
});

test("formatNewsTime shows Jakarta time, with a date for older items", () => {
  const now = new Date("2026-10-31T06:00:00Z"); // 13:00 WIB
  assert.equal(formatNewsTime("2026-10-31T06:25:00Z", "en", now), "13:25 WIB");
  assert.match(formatNewsTime("2026-10-29T06:25:00Z", "en", now), /29 Oct.*13:25 WIB/u);
  assert.equal(formatNewsTime(null, "en", now), "");
  assert.equal(formatNewsTime("garbage", "en", now), "");
});
