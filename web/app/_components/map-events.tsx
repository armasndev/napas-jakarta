"use client";

import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { Language } from "@/lib/i18n";
import { CHIP_DRAG_TYPE, type ContextChip, type EventPin } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";

export function eventChip(pin: EventPin, language: Language): ContextChip {
  const copy = getNewsCopy(language).events;
  return {
    id: pin.id,
    kind: "event",
    sub: `${copy.reports(pin.reports)}, ${copy.unverified}`,
    title: pin.title,
  };
}

/**
 * Reported-event markers (DOM, so they are real focusable buttons and native drag sources).
 * Position is the place named in the article text, drawn as an area when only a district matched.
 */
export function MapEvents({
  language,
  map,
  onEvents,
  onSelect,
  visible,
}: {
  readonly language: Language;
  readonly map: MapLibreMap | null;
  readonly onEvents: (pins: readonly EventPin[]) => void;
  readonly onSelect: (pin: EventPin) => void;
  readonly visible: boolean;
}) {
  const onEventsRef = useRef(onEvents);
  const onSelectRef = useRef(onSelect);
  onEventsRef.current = onEvents;
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map || !visible) {
      onEventsRef.current([]);
      return undefined;
    }
    const controller = new AbortController();
    const markers: Marker[] = [];
    const copy = getNewsCopy(language).events;

    fetch(`/api/events?language=${language}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("events"))))
      .then((payload: { events?: EventPin[] }) => {
        const pins = Array.isArray(payload.events) ? payload.events : [];
        onEventsRef.current(pins);
        for (const pin of pins) {
          const element = document.createElement("button");
          element.type = "button";
          element.className = "event-marker";
          element.dataset.area = pin.precision === "district" ? "true" : "false";
          element.setAttribute("aria-label", `${pin.title}, ${copy.reports(pin.reports)}, ${copy.unverified}`);
          element.draggable = true;
          const diamond = document.createElement("span");
          diamond.className = "event-diamond";
          element.append(diamond);
          element.addEventListener("click", () => onSelectRef.current(pin));
          element.addEventListener("dragstart", (event) => {
            if (!event.dataTransfer) return;
            event.dataTransfer.setData(CHIP_DRAG_TYPE, JSON.stringify(eventChip(pin, language)));
            event.dataTransfer.setData("text/plain", pin.title);
            event.dataTransfer.effectAllowed = "copy";
          });
          markers.push(new Marker({ element }).setLngLat([pin.lng, pin.lat]).addTo(map));
        }
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") onEventsRef.current([]);
      });

    return () => {
      controller.abort();
      for (const marker of markers) marker.remove();
    };
  }, [language, map, visible]);

  return null;
}
