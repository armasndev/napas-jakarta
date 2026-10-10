const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const SITE_URL = (configuredSiteUrl || "https://napasjakarta.armasn.dev").replace(/\/+$/, "");
export const SITE_NAME = "Napas Jakarta";
export const HOME_TITLES = {
  en: "Jakarta Air Quality Map: PM2.5 & ISPU | Napas Jakarta",
  id: "Peta Kualitas Udara Jakarta: PM2.5 & ISPU | Napas Jakarta",
} as const;
export const EN_HOME_PATH = "/";
export const ID_HOME_PATH = "/id";
export const EN_GUIDE_PATH = "/air-quality-jakarta";
export const ID_GUIDE_PATH = "/id/kualitas-udara-jakarta";
export const EN_ABOUT_PATH = "/about";
export const ID_ABOUT_PATH = "/id/tentang";
export const EN_PRIVACY_PATH = "/privacy";
export const ID_PRIVACY_PATH = "/id/privasi";

export function absoluteUrl(path: string): string {
  const url = new URL(path, `${SITE_URL}/`).toString();
  // The homepage canonical is emitted without a trailing slash; keep the sitemap and
  // structured data on the same form so every signal names one URL per page.
  return path === "/" ? url.replace(/\/$/, "") : url;
}
