import type { Language } from "./i18n";

/** "13:25 WIB" for today, "30 Oct, 13:25 WIB" for older items. Always Jakarta time. */
export function formatNewsTime(value: string | null, language: Language, now: Date = new Date()): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "id" ? "id-ID" : "en-GB";
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit", hour12: false, minute: "2-digit", timeZone: "Asia/Jakarta",
  }).format(date);
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jakarta", year: "numeric" }).format(d);
  if (day(date) === day(now)) return `${clock} WIB`;
  const label = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(date);
  return `${label}, ${clock} WIB`;
}

/** Plain station badge colours shared by the chip cards (same hues as the map legend). */
export function categoryBadgeColor(category: string): string {
  if (category === "Good") return "#2e7d4f";
  if (category === "Moderate") return "#e3b800";
  if (category === "Unhealthy") return "#c62828";
  return "#6b6759";
}
