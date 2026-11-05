import assert from "node:assert/strict";
import test from "node:test";
import type { DemoStation } from "./napas.ts";
import { reconcileStationId, resolveStation } from "./station-selection.ts";

const stations: readonly DemoStation[] = [
  {
    id: "live-station",
    name: "Live station",
    district: "Central Jakarta",
    category: "Good",
    ispu: 42,
    pm25: 8,
    observedAt: "09:00 WIB",
    source: "Official station records",
    latitude: -6.2,
    longitude: 106.8,
  },
];

test("resolves a selected station only from the current catalog", () => {
  assert.equal(resolveStation(stations, "live-station"), stations[0]);
  assert.equal(resolveStation(stations, "demo-station"), undefined);
  assert.equal(resolveStation(stations, undefined), undefined);
});

test("reconciles a selection when the station catalog changes", () => {
  assert.equal(reconcileStationId(stations, "live-station"), "live-station");
  assert.equal(reconcileStationId(stations, "removed-station"), undefined);
  assert.equal(reconcileStationId(stations, undefined), undefined);
});
