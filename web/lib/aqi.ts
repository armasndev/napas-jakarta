// US EPA PM2.5 AQI bands (2024 revision). Colours follow EPA's standard AQI palette.
// Mirrors app/aqi.py: the server computes the value, the client only classifies it.

export type AqiBandKey = "good" | "moderate" | "usg" | "unhealthy" | "very_unhealthy";

export type AqiBand = {
  key: AqiBandKey;
  min: number;
  max: number;
  range: string;
  color: string;
  textColor: string;
};

export const AQI_BANDS: readonly AqiBand[] = [
  { key: "good", min: 0, max: 50, range: "0–50", color: "#00E400", textColor: "#172B2B" },
  { key: "moderate", min: 51, max: 100, range: "51–100", color: "#FFFF00", textColor: "#172B2B" },
  { key: "usg", min: 101, max: 150, range: "101–150", color: "#FF7E00", textColor: "#172B2B" },
  { key: "unhealthy", min: 151, max: 200, range: "151–200", color: "#FF0000", textColor: "#FFFFFF" },
  { key: "very_unhealthy", min: 201, max: 300, range: "201–300", color: "#8F3F97", textColor: "#FFFFFF" },
];

export const AQI_UNAVAILABLE_COLOR = "#7B8790";

export function aqiBand(aqi: number | null | undefined): AqiBand | null {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi)) return null;
  return AQI_BANDS.find((band) => aqi >= band.min && aqi <= band.max) ?? null;
}
