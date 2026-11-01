"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChat } from "./agent-chat";
import { SidePanel, type PanelTab } from "./side-panel";
import { SiteHeader } from "./site-header";
import { WorkspaceMap } from "./workspace-map";
import { trackNapasEvent } from "@/lib/analytics";
import {
  LANGUAGE_CHANGE_EVENT,
  LANGUAGE_STORAGE_KEY,
  syncDocumentLanguage,
  type Language,
} from "@/lib/i18n";
import { type DemoStation } from "@/lib/napas";
import { addChip, chipKey, type ContextChip } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";
import { toggleMobileMapOverlay } from "@/lib/mobile-layout";
import { EN_HOME_PATH, HOME_TITLES, ID_HOME_PATH } from "@/lib/site";
import {
  pickStation,
  reconcileStationId,
  reconcileStationIds,
  resolveStation,
} from "@/lib/station-selection";

export function Workspace({ initialLanguage }: { readonly initialLanguage: Language }) {
  // The chat can carry several stations; the map shows one at a time.
  const [stationIds, setStationIds] = useState<readonly string[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>();
  const [stationOptions, setStationOptions] = useState<readonly DemoStation[]>([]);
  // On narrow screens the side panel is a full-screen sheet over the chat.
  const [mapOverlayOpen, setMapOverlayOpen] = useState(false);
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("news");
  const [chips, setChips] = useState<readonly ContextChip[]>([]);
  const [chipMessage, setChipMessage] = useState("");
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const chipCopy = getNewsCopy(language).chips;
  const selectedStations = useMemo(
    () => stationIds.flatMap((id) => resolveStation(stationOptions, id) ?? []),
    [stationIds, stationOptions],
  );
  const attachedKeys = useMemo(() => new Set(chips.map(chipKey)), [chips]);
  // Handlers can outlive a render (a failed send re-adds chips later), so read the latest list.
  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  const stationIdsRef = useRef(stationIds);
  stationIdsRef.current = stationIds;

  useEffect(() => {
    syncDocumentLanguage(language);
    document.title = HOME_TITLES[language];
  }, [language]);

  const handleChipAdd = useCallback(
    (chip: ContextChip) => {
      const outcome = addChip(chipsRef.current, chip);
      setChipMessage(
        outcome.result === "added"
          ? chipCopy.added(outcome.chips.length)
          : outcome.result === "limit"
            ? chipCopy.limit
            : chipCopy.duplicate,
      );
      if (outcome.result === "added") {
        chipsRef.current = outcome.chips;
        setChips(outcome.chips);
        trackNapasEvent("context_chip_added", { kind: chip.kind });
      }
    },
    [chipCopy],
  );

  const handleChipRemove = useCallback(
    (chip: ContextChip) => {
      setChips((current) => current.filter((existing) => chipKey(existing) !== chipKey(chip)));
      setChipMessage(chipCopy.removed(chip.title));
    },
    [chipCopy],
  );

  const changeLanguage = (nextLanguage: Language) => {
    if (nextLanguage === language) return;
    // News and events are separate EN and ID feeds, so attached articles and events
    // cannot follow a language switch. Station pins can.
    const dropped = chips.filter((chip) => chip.kind !== "station").length;
    if (dropped > 0) {
      setChips((current) => current.filter((chip) => chip.kind === "station"));
      setChipMessage(getNewsCopy(nextLanguage).chips.switchDropped(dropped));
    }
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

  // Closing the map detail only clears the map; clearing from the chat empties the whole selection.
  const handleStationClear = useCallback((source: "map_detail" | "chat_context") => {
    setSelectedStationId(undefined);
    if (source === "chat_context") setStationIds([]);
    trackNapasEvent("station_selection_cleared", { source });
  }, []);

  const handleStationSelect = useCallback(
    (station: DemoStation, source: "map_marker" | "station_list" | "chat_picker") => {
      const next = pickStation(
        { ids: stationIdsRef.current, mapId: selectedStationId },
        station.id,
        source === "chat_picker" ? "chat_picker" : "map",
      );
      stationIdsRef.current = next.ids;
      setStationIds(next.ids);
      setSelectedStationId(next.mapId);
      if (next.result === "limit") setChipMessage(getNewsCopy(language).stations.limit);
      trackNapasEvent("station_selected", { source });
    },
    [language, selectedStationId],
  );

  const handleStationsChange = useCallback((stations: readonly DemoStation[]) => {
    setStationOptions(stations);
    setSelectedStationId((currentId) => reconcileStationId(stations, currentId));
    setStationIds((current) => reconcileStationIds(stations, current));
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
            attachments={chips}
            chipMessage={chipMessage}
            language={language}
            isLegendOpen={mobileLegendOpen}
            isMapOpen={mapOverlayOpen}
            onAttachmentAdd={handleChipAdd}
            onAttachmentRemove={handleChipRemove}
            onAttachmentsClear={() => {
              chipsRef.current = [];
              setChips([]);
              setChipMessage("");
            }}
            onMapToggle={() => setMapOverlayOpen((open) => toggleMobileMapOverlay(open))}
            onLegendOpen={() => setMobileLegendOpen(true)}
            onStationClear={handleStationClear}
            onStationSelect={handleStationSelect}
            selectedStations={selectedStations}
            stationOptions={stationOptions}
          />
        </section>
        <SidePanel
          attachedKeys={attachedKeys}
          language={language}
          map={
            <WorkspaceMap
              attachedKeys={attachedKeys}
              id="map-stage-panel"
              language={language}
              isMobileOverlayOpen={mapOverlayOpen}
              mobileLegendOpen={mobileLegendOpen}
              onChipAdd={handleChipAdd}
              onMobileLegendClose={() => setMobileLegendOpen(false)}
              onStationClear={handleStationClear}
              onStationSelect={handleStationSelect}
              onStationsChange={handleStationsChange}
              selectedStationId={selectedStationId}
            />
          }
          onChipAdd={handleChipAdd}
          onClose={() => setMapOverlayOpen(false)}
          onTabChange={(next) => {
            setTab(next);
            trackNapasEvent("side_panel_tab_changed", { tab: next });
          }}
          tab={tab}
        />
      </div>

      <span className="sr-only" role="status">{chipMessage}</span>
    </main>
  );
}
