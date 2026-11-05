import type { DemoStation } from "./napas";

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
