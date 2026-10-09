export type NapasAnalyticsEvent =
  | "assistant_question_submitted"
  | "assistant_feedback_submitted"
  | "suggested_question_selected"
  | "station_selected"
  | "station_selection_cleared"
  | "topic_picker_opened"
  | "topic_picker_closed"
  | "topic_selected"
  | "topic_cleared"
  | "station_picker_opened"
  | "station_picker_closed"
  | "mobile_map_opened"
  | "mobile_map_closed"
  | "station_list_opened"
  | "station_list_closed"
  | "map_layer_menu_opened"
  | "map_layer_menu_closed"
  | "map_layer_toggled"
  | "map_index_changed"
  | "map_filter_changed"
  | "map_filters_reset"
  | "map_zoom_control_clicked"
  | "map_view_changed"
  | "map_station_question_clicked"
  | "map_legend_opened"
  | "map_legend_closed"
  | "map_retry_clicked";

export type NapasAnalyticsEventParameters = {
  assistant_feedback_submitted: { rating: "positive" | "negative" };
  station_selected: { source: "map_marker" | "station_list" | "chat_picker" };
  station_selection_cleared: { source: "map_detail" | "chat_context" };
  topic_picker_opened: { source: "header" | "selected_topic" };
  map_layer_toggled: {
    layer: "heatmap" | "roads" | "boundaries" | "waterways" | "transit" | "landmarks" | "place_labels";
  };
  map_index_changed: { index: "aqi" | "ispu" };
  map_filter_changed:
    | {
        filter: "air_quality";
        value: "all" | "good" | "moderate" | "unhealthy" | "usg" | "very_unhealthy" | "stale";
      }
    | { filter: "district"; value: "all" | "specific" };
  map_zoom_control_clicked: { direction: "in" | "out" };
};

type ParametersFor<E extends NapasAnalyticsEvent> = E extends keyof NapasAnalyticsEventParameters
  ? NapasAnalyticsEventParameters[E]
  : undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    napasAnalyticsConsent?: "granted" | "denied" | null;
  }
}

export function isPublicAnalyticsPath(pathname: string): boolean {
  return [
    "/",
    "/id",
    "/about",
    "/id/tentang",
    "/air-quality-jakarta",
    "/id/kualitas-udara-jakarta",
  ].includes(pathname);
}

export function isConsentAvailablePath(pathname: string): boolean {
  return isPublicAnalyticsPath(pathname) || ["/privacy", "/id/privasi"].includes(pathname);
}

export function sanitizeAnalyticsUrl(value: string, pathOnly = false): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return pathOnly ? `${url.origin}${url.pathname}` : url.origin;
  } catch {
    return "";
  }
}

function setSafePageContext(): void {
  if (!window.gtag) return;
  window.gtag("set", "page_location", sanitizeAnalyticsUrl(window.location.href, true));
  window.gtag("set", "page_referrer", sanitizeAnalyticsUrl(document.referrer));
}

export function trackNapasEvent<E extends NapasAnalyticsEvent>(eventName: E, parameters?: ParametersFor<E>): void {
  if (
    typeof window === "undefined" ||
    window.napasAnalyticsConsent !== "granted" ||
    !window.gtag ||
    !isPublicAnalyticsPath(window.location.pathname)
  ) {
    return;
  }

  setSafePageContext();
  // Only fixed event names and bounded enums are allowed; never send user content,
  // station/district identifiers, session IDs, or URL parameters.
  if (parameters === undefined) {
    window.gtag("event", eventName);
  } else {
    window.gtag("event", eventName, parameters);
  }
}

export function suspendAnalyticsForSession(): void {
  if (typeof window === "undefined" || !window.gtag) return;

  window.gtag("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}
