"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentChat } from "./agent-chat";
import { SiteHeader } from "./site-header";
import { WorkspaceMap } from "./workspace-map";
import { trackNapasEvent } from "@/lib/analytics";
import {
  getUiCopy,
  LANGUAGE_CHANGE_EVENT,
  LANGUAGE_STORAGE_KEY,
  syncDocumentLanguage,
  type Language,
} from "@/lib/i18n";
import { type DemoStation } from "@/lib/napas";
import { toggleMobileMapOverlay } from "@/lib/mobile-layout";
import { EN_HOME_PATH, HOME_TITLES, ID_HOME_PATH } from "@/lib/site";
import { reconcileStationId, resolveStation } from "@/lib/station-selection";

export function Workspace({ initialLanguage }: { readonly initialLanguage: Language }) {
  const [selectedStationId, setSelectedStationId] = useState<string>();
  const [stationOptions, setStationOptions] = useState<readonly DemoStation[]>([]);
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const copy = getUiCopy(language);
  const selectedStation = resolveStation(stationOptions, selectedStationId);

  useEffect(() => {
    syncDocumentLanguage(language);
    document.title = HOME_TITLES[language];
  }, [language]);

  const changeLanguage = (nextLanguage: Language) => {
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    } catch {
      // The URL and in-memory state still carry the choice if storage is unavailable.
    }
    // Keep the URL, canonical language and visible language aligned without navigating,
    // so the map and chat state survive the switch.
    window.history.replaceState(window.history.state, "", nextLanguage === "id" ? ID_HOME_PATH : EN_HOME_PATH);
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  };

  const handleStationClear = useCallback((source: "map_detail" | "chat_context") => {
    setSelectedStationId(undefined);
    trackNapasEvent("station_selection_cleared", { source });
  }, []);

  const handleStationSelect = useCallback((station: DemoStation, source: "map_marker" | "station_list" | "chat_picker") => {
    setSelectedStationId(station.id);
    trackNapasEvent("station_selected", { source });
  }, []);

  const handleStationsChange = useCallback((stations: readonly DemoStation[]) => {
    setStationOptions(stations);
    setSelectedStationId((currentId) => reconcileStationId(stations, currentId));
  }, []);

  useEffect(() => {
    if (!mapOverlayOpen) {
      setMobileLegendOpen(false);
    }
  }, [mapOverlayOpen]);

  return (
    <main className="napas-od-app" id="main">
      <SiteHeader language={language} onLanguageChange={changeLanguage} />

      <div className="workspace" data-mobile-map-open={mapOverlayOpen} data-od-id="dashboard-workspace">
        <section aria-labelledby="chat-heading" className="chat-panel" id="chat-panel" data-od-id="assistant-panel">
          <AgentChat
            language={language}
            isLegendOpen={mobileLegendOpen}
            isMapOpen={mapOverlayOpen}
            onMapToggle={() => setMapOverlayOpen((open) => toggleMobileMapOverlay(open))}
            onLegendOpen={() => setMobileLegendOpen(true)}
            onStationClear={handleStationClear}
            onStationSelect={handleStationSelect}
            selectedStation={selectedStation?.name}
            selectedStationId={selectedStationId}
            stationOptions={stationOptions}
          />
        </section>
        <WorkspaceMap
          id="map-panel"
          language={language}
          isMobileOverlayOpen={mapOverlayOpen}
          mobileLegendOpen={mobileLegendOpen}
          onMobileLegendClose={() => setMobileLegendOpen(false)}
          onStationClear={handleStationClear}
          onStationSelect={handleStationSelect}
          onStationsChange={handleStationsChange}
          selectedStationId={selectedStationId}
        />
      </div>

    </main>
  );
}
