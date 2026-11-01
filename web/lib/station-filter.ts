import { aqiBand } from "./aqi.ts";
import { categoryKey, type AirQualityCategory } from "./napas.ts";

export type IndexMode = "aqi" | "ispu";

export type IspuFilter = "good" | "moderate" | "unhealthy" | "stale";
export type AqiFilter = "good" | "moderate" | "usg" | "unhealthy" | "very_unhealthy" | "stale";
export type FilterCategory = "all" | IspuFilter | AqiFilter;

export type FilterableStation = {
  category: AirQualityCategory;
  aqi?: number | null;
};

// ISPU mode matches the official categories. AQI mode matches EPA bands, and a
// station with no AQI counts as "stale" (shown as "No AQI" in the filter).
export function matchesCategoryFilter(
  station: FilterableStation,
  filter: FilterCategory,
  indexMode: IndexMode,
): boolean {
  if (filter === "all") return true;
  if (indexMode === "ispu") return categoryKey[station.category] === filter;
  if (filter === "stale") return station.aqi === null || station.aqi === undefined;
  return aqiBand(station.aqi ?? null)?.key === filter;
}
