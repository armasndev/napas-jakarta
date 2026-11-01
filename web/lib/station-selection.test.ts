import assert from "node:assert/strict";
import test from "node:test";
import type { DemoStation } from "./napas.ts";
import {
  MAX_CHAT_STATIONS,
  pickStation,
  reconcileStationId,
  reconcileStationIds,
  resolveStation,
} from "./station-selection.ts";

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

test("the chat picker toggles stations and the map follows the latest pick", () => {
  let state = { ids: [] as readonly string[], mapId: undefined as string | undefined };
  const add = pickStation(state, "a", "chat_picker");
  assert.deepEqual([add.ids, add.mapId, add.result], [["a"], "a", "added"]);
  state = add;
  const second = pickStation(state, "b", "chat_picker");
  assert.deepEqual([second.ids, second.mapId], [["a", "b"], "b"]);
  const removed = pickStation(second, "b", "chat_picker");
  assert.deepEqual([removed.ids, removed.mapId, removed.result], [["a"], undefined, "removed"]);
  const keepsMap = pickStation(second, "a", "chat_picker");
  assert.deepEqual([keepsMap.ids, keepsMap.mapId], [["b"], "b"]);
});

test("a map pick selects one station on the map and adds it to the chat selection once", () => {
  const first = pickStation({ ids: ["a"], mapId: "a" }, "b", "map");
  assert.deepEqual([first.ids, first.mapId, first.result], [["a", "b"], "b", "added"]);
  const again = pickStation(first, "b", "map");
  assert.deepEqual([again.ids, again.mapId, again.result], [["a", "b"], "b", "unchanged"]);
  const back = pickStation(first, "a", "map");
  assert.deepEqual([back.ids, back.mapId], [["a", "b"], "a"]);
});

test("the chat selection stops at the limit but the map can still show a station", () => {
  const ids = Array.from({ length: MAX_CHAT_STATIONS }, (_, index) => `s${index}`);
  const full = { ids, mapId: "s0" as string | undefined };
  const viaChat = pickStation(full, "extra", "chat_picker");
  assert.deepEqual([viaChat.ids.length, viaChat.mapId, viaChat.result], [MAX_CHAT_STATIONS, "s0", "limit"]);
  const viaMap = pickStation(full, "extra", "map");
  assert.deepEqual([viaMap.ids.length, viaMap.mapId, viaMap.result], [MAX_CHAT_STATIONS, "extra", "limit"]);
});

test("reconcileStationIds drops stations that left the catalog", () => {
  assert.deepEqual(reconcileStationIds(stations, ["live-station", "gone"]), ["live-station"]);
});
