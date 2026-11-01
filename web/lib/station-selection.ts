import type { DemoStation } from "./napas";

/** Stations that can ride along with one chat message. The map still shows only one at a time. */
export const MAX_CHAT_STATIONS = 5;

export function resolveStation(
  stations: readonly DemoStation[],
  stationId: string | undefined,
): DemoStation | undefined {
  return stationId === undefined ? undefined : stations.find((station) => station.id === stationId);
}

export function reconcileStationId(
  stations: readonly DemoStation[],
  stationId: string | undefined,
): string | undefined {
  return resolveStation(stations, stationId)?.id;
}

/** Keep only chat-selected stations that still exist in the catalog. */
export function reconcileStationIds(
  stations: readonly DemoStation[],
  stationIds: readonly string[],
): readonly string[] {
  return stationIds.filter((id) => stations.some((station) => station.id === id));
}

export type StationSelection = {
  /** Stations attached to the chat context (several allowed). */
  readonly ids: readonly string[];
  /** The single station shown in the map's detail overlay. */
  readonly mapId: string | undefined;
  readonly result: "added" | "removed" | "limit" | "unchanged";
};

/**
 * Chat picker: toggles a station in the multi-selection and shows it on the map.
 * Map click or station list: shows it on the map and also adds it to the chat context.
 */
export function pickStation(
  current: { readonly ids: readonly string[]; readonly mapId: string | undefined },
  stationId: string,
  source: "chat_picker" | "map",
): StationSelection {
  const has = current.ids.includes(stationId);
  if (source === "chat_picker" && has) {
    return {
      ids: current.ids.filter((id) => id !== stationId),
      mapId: current.mapId === stationId ? undefined : current.mapId,
      result: "removed",
    };
  }
  if (has) return { ids: current.ids, mapId: stationId, result: "unchanged" };
  if (current.ids.length >= MAX_CHAT_STATIONS) {
    // The map can still show it; only the chat selection is full.
    return { ids: current.ids, mapId: source === "map" ? stationId : current.mapId, result: "limit" };
  }
  return { ids: [...current.ids, stationId], mapId: stationId, result: "added" };
}
