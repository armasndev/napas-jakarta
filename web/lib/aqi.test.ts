import test from "node:test";
import assert from "node:assert/strict";
import { aqiBand, AQI_BANDS } from "./aqi.ts";

test("AQI bands classify EPA edges and abstain without a value", () => {
  assert.equal(aqiBand(0)?.key, "good");
  assert.equal(aqiBand(50)?.key, "good");
  assert.equal(aqiBand(51)?.key, "moderate");
  assert.equal(aqiBand(101)?.key, "usg");
  assert.equal(aqiBand(151)?.key, "unhealthy");
  assert.equal(aqiBand(201)?.key, "very_unhealthy");
  assert.equal(aqiBand(300)?.key, "very_unhealthy");
  assert.equal(aqiBand(null), null);
  assert.equal(aqiBand(undefined), null);
  assert.equal(aqiBand(Number.NaN), null);
});

test("AQI bands cover 0 to 300 without gaps", () => {
  for (let value = 0; value <= 300; value += 1) {
    assert.notEqual(aqiBand(value), null, `value ${value} has no band`);
  }
  assert.equal(AQI_BANDS.length, 5);
});
