import test from "node:test";
import assert from "node:assert/strict";
import { matchesCategoryFilter } from "./station-filter.ts";

const moderateAqi = { category: "Unhealthy" as const, aqi: 80 };
const noAqi = { category: "Moderate" as const, aqi: null };

test("AQI filter matches EPA bands, not ISPU categories", () => {
  assert.equal(matchesCategoryFilter(moderateAqi, "moderate", "aqi"), true);
  assert.equal(matchesCategoryFilter(moderateAqi, "unhealthy", "aqi"), false);
  assert.equal(matchesCategoryFilter({ category: "Good", aqi: 160 }, "unhealthy", "aqi"), true);
  assert.equal(matchesCategoryFilter({ category: "Good", aqi: 120 }, "usg", "aqi"), true);
});

test("AQI filter treats stations without an AQI as no-AQI", () => {
  assert.equal(matchesCategoryFilter(noAqi, "stale", "aqi"), true);
  assert.equal(matchesCategoryFilter(moderateAqi, "stale", "aqi"), false);
});

test("ISPU filter keeps the official categories", () => {
  assert.equal(matchesCategoryFilter(moderateAqi, "unhealthy", "ispu"), true);
  assert.equal(matchesCategoryFilter(noAqi, "moderate", "ispu"), true);
  assert.equal(matchesCategoryFilter(noAqi, "all", "ispu"), true);
});
