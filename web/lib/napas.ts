export type AirQualityCategory = "Good" | "Moderate" | "Unhealthy" | "Stale / missing";

export type DemoStation = {
  id: string;
  name: string;
  district: string;
  category: AirQualityCategory;
  ispu: number | null;
  pm25: number | null;
  observedAt: string;
  source: string;
  sourceUrl?: string | null;
  latitude: number;
  longitude: number;
  // Derived PM2.5 AQI. Optional because the bundled demo stations carry no AQI.
  aqi?: number | null;
  aqiCategory?: string | null;
  aqiHours?: number | null;
  pm25Mean24h?: number | null;
};

export type StationCatalogRow = {
  id: string;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  ispu: number | null;
  pm25: number | null;
  category: AirQualityCategory;
  observed_at: string | null;
  source: string;
  source_url: string | null;
  freshness: Record<string, unknown> | null;
  aqi: number | null;
  aqi_category: string | null;
  aqi_pm25_24h_mean: number | null;
  aqi_hours: number | null;
  aqi_window_end: string | null;
};

export type StationCatalogResponse = {
  contract_version: 1;
  stations: StationCatalogRow[];
  summary: {
    station_count: number;
    reporting_count: number;
    good_count: number;
    moderate_count: number;
    unhealthy_count: number;
    stale_count: number;
    aqi_moderate_count?: number;
    aqi_unhealthy_count?: number;
    latest_observed_at: string | null;
    overall_category: AirQualityCategory;
    source_mode: "live" | "demo";
  };
};

/**
 * Temporary visual fixture copied from the OpenDesign reference. Coordinates
 * are illustrative until the FastAPI station contract supplies official
 * geospatial metadata.
 */
export const DEMO_STATIONS: readonly DemoStation[] = [
  { id: "rusun-penjaringan", name: "Rusun Penjaringan", district: "North Jakarta", latitude: -6.108, longitude: 106.768, ispu: 147, category: "Unhealthy", pm25: 67, observedAt: "09:18 WIB", source: "Napas Jakarta · station records" },
  { id: "pluit", name: "Pluit", district: "North Jakarta", latitude: -6.115, longitude: 106.792, ispu: 89, category: "Moderate", pm25: 34, observedAt: "09:20 WIB", source: "Napas Jakarta · station records" },
  { id: "pademangan", name: "Pademangan", district: "North Jakarta", latitude: -6.132, longitude: 106.842, ispu: 76, category: "Moderate", pm25: 27, observedAt: "09:17 WIB", source: "Napas Jakarta · station records" },
  { id: "tanjung-priok", name: "Tanjung Priok", district: "North Jakarta", latitude: -6.108, longitude: 106.881, ispu: 132, category: "Unhealthy", pm25: 55, observedAt: "09:19 WIB", source: "Napas Jakarta · station records" },
  { id: "kelapa-gading", name: "Kelapa Gading", district: "North Jakarta", latitude: -6.161, longitude: 106.906, ispu: 82, category: "Moderate", pm25: 30, observedAt: "09:20 WIB", source: "Napas Jakarta · station records" },
  { id: "pt-jiep", name: "PT. JIEP", district: "East Jakarta", latitude: -6.193, longitude: 106.928, ispu: 118, category: "Unhealthy", pm25: 48, observedAt: "09:16 WIB", source: "Napas Jakarta · station records" },
  { id: "rptra-harapan-mulia", name: "RPTRA Harapan Mulia", district: "Central Jakarta", latitude: -6.166, longitude: 106.857, ispu: 93, category: "Moderate", pm25: 37, observedAt: "09:20 WIB", source: "Napas Jakarta · station records" },
  { id: "kemayoran", name: "Kemayoran", district: "Central Jakarta", latitude: -6.155, longitude: 106.850, ispu: 71, category: "Moderate", pm25: 25, observedAt: "09:18 WIB", source: "Napas Jakarta · station records" },
  { id: "cempaka-putih", name: "Cempaka Putih", district: "Central Jakarta", latitude: -6.184, longitude: 106.872, ispu: 45, category: "Good", pm25: 13, observedAt: "09:14 WIB", source: "Napas Jakarta · station records" },
  { id: "gambir", name: "Gambir", district: "Central Jakarta", latitude: -6.176, longitude: 106.830, ispu: 67, category: "Moderate", pm25: 23, observedAt: "09:19 WIB", source: "Napas Jakarta · station records" },
  { id: "tomang", name: "Tomang", district: "West Jakarta", latitude: -6.178, longitude: 106.799, ispu: 75, category: "Moderate", pm25: 26, observedAt: "09:15 WIB", source: "Napas Jakarta · station records" },
  { id: "rusunawa-pesakih", name: "Rusunawa Pesakih", district: "West Jakarta", latitude: -6.160, longitude: 106.739, ispu: null, category: "Stale / missing", pm25: null, observedAt: "08:08 WIB", source: "Napas Jakarta · station records" },
  { id: "setiabudi", name: "Setiabudi", district: "South Jakarta", latitude: -6.214, longitude: 106.833, ispu: 108, category: "Unhealthy", pm25: 42, observedAt: "09:17 WIB", source: "Napas Jakarta · station records" },
  { id: "kebayoran-baru", name: "Kebayoran Baru", district: "South Jakarta", latitude: -6.244, longitude: 106.799, ispu: 58, category: "Moderate", pm25: 19, observedAt: "09:13 WIB", source: "Napas Jakarta · station records" },
  { id: "pejaten-barat", name: "Pejaten Barat", district: "South Jakarta", latitude: -6.276, longitude: 106.836, ispu: 39, category: "Good", pm25: 11, observedAt: "09:12 WIB", source: "Napas Jakarta · station records" },
  { id: "jagakarsa", name: "Jagakarsa", district: "South Jakarta", latitude: -6.328, longitude: 106.824, ispu: null, category: "Stale / missing", pm25: null, observedAt: "07:46 WIB", source: "Napas Jakarta · station records" },
];

export type NapasArtifact =
  | { type: "map-focus"; stationIds: string[]; bounds?: { north: number; south: number; east: number; west: number } }
  | { type: "station-card"; stationId: string }
  | { type: "trend-chart"; metric: "pm25" | "pm10"; points: Array<{ date: string; value: number }> }
  | { type: "comparison-table"; rows: Array<{ label: string; value: string }> }
  | { type: "source-list"; sources: Array<{ id: string; title: string; url?: string }> };

export const categoryClass: Record<AirQualityCategory, string> = {
  Good: "napas-category-good",
  Moderate: "napas-category-moderate",
  Unhealthy: "napas-category-unhealthy",
  "Stale / missing": "napas-category-stale",
};

export const categoryKey: Record<AirQualityCategory, string> = {
  Good: "good",
  Moderate: "moderate",
  Unhealthy: "unhealthy",
  "Stale / missing": "stale",
};
