import assert from "node:assert/strict";
import test from "node:test";
import { getUiCopy, localizedCategory, localizedDistrict, replaceCopy, syncDocumentLanguage } from "./i18n.ts";

test("English is the default UI language and Indonesian copy is available", () => {
  assert.equal(getUiCopy("en").chat.heading, "Napas Advisor");
  assert.equal(getUiCopy("id").chat.heading, "Penasihat Napas");
  assert.notEqual(getUiCopy("en").map.heading, getUiCopy("id").map.heading);
});

test("dynamic air-quality labels and placeholders localize without changing filter values", () => {
  assert.equal(localizedCategory("Moderate", "id"), "Sedang");
  assert.equal(localizedDistrict("North Jakarta", "id"), "Jakarta Utara");
  assert.equal(replaceCopy("Sertakan {station} dalam pertanyaan berikutnya", { station: "Kelapa Gading" }), "Sertakan Kelapa Gading dalam pertanyaan berikutnya");
});

test("document language follows the selected UI language", () => {
  const documentRef = { documentElement: { lang: "en" } };

  syncDocumentLanguage("id", documentRef);
  assert.equal(documentRef.documentElement.lang, "id");

  syncDocumentLanguage("en", documentRef);
  assert.equal(documentRef.documentElement.lang, "en");
});

function copyKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    copyKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

test("English and Indonesian UI copy have identical keys", () => {
  const english = copyKeys(getUiCopy("en")).sort();
  const indonesian = copyKeys(getUiCopy("id")).sort();
  assert.deepEqual(indonesian, english);
});

test("AQI copy is translated, not copied from English", () => {
  const en = getUiCopy("en").map as Record<string, string>;
  const id = getUiCopy("id").map as Record<string, string>;
  for (const key of [
    "indexAqi", "aqiDefinition", "aqiUnavailable", "aqiBandUsg",
    "aqiBandVeryUnhealthy", "noAqiFilter", "heatmapNeedsIspu", "unhealthyAqiLabel",
    "unhealthyDetailAqi", "detailObservedAt",
  ]) {
    assert.notEqual(id[key], en[key], `${key} is still English in Indonesian`);
    assert.ok(id[key].length > 0, `${key} is empty in Indonesian`);
  }
});
