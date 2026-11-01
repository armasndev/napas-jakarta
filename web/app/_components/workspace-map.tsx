"use client";

import {
  CameraIcon,
  Layers2Icon,
  ChevronDownIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  RadioTowerIcon,
  XIcon,
  WindIcon,
} from "lucide-react";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getUiCopy, localizedCategory, localizedDistrict, type Language } from "@/lib/i18n";
import { trackNapasEvent } from "@/lib/analytics";
import {
  categoryKey,
  type StationCatalogResponse,
  type AirQualityCategory,
  type DemoStation,
} from "@/lib/napas";
import { normalizeHeatmapWeight, STATION_HEATMAP_LAYER_ID } from "@/lib/map-heatmap";
import { MAP_LAYER_DEFAULTS, mapLayerMatches, type MapLayerKey } from "@/lib/map-layers";
import { CHIP_DRAG_TYPE, chipKey, type ContextChip, type EventPin } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";
import { categoryBadgeColor, formatNewsTime } from "@/lib/news-format";
import { eventChip, MapEvents } from "./map-events";

const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
const JAKARTA_CENTER: [number, number] = [106.84, -6.2];
const JAKARTA_BOUNDS: [[number, number], [number, number]] = [
  [106.48, -6.55],
  [107.18, -5.6],
];

type FilterCategory = "all" | "good" | "moderate" | "unhealthy" | "stale";

type MapFilterOption = {
  readonly label: string;
  readonly value: string;
};

function MapFilterDropdown({
  id,
  icon,
  label,
  onChange,
  options,
  value,
}: {
  readonly id: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly MapFilterOption[];
  readonly value: string;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        pickerRef.current?.querySelector<HTMLButtonElement>(".filter-select-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="filter-label map-filter-dropdown" ref={pickerRef}>
      <span>{label}</span>
      <button
        aria-controls={`${id}-menu`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="filter-select-trigger"
        id={id}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {icon}
        <span>{selectedOption?.label}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      {open ? (
        <div aria-labelledby={id} className="filter-select-menu" id={`${id}-menu`} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={cn("filter-select-option", option.value === value && "is-selected")}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const LAYER_DEFAULTS = MAP_LAYER_DEFAULTS;

const CATEGORY_COLOR: Record<AirQualityCategory, string> = {
  Good: "#2E9B78",
  Moderate: "#E2A900",
  Unhealthy: "#D94E3E",
  "Stale / missing": "#7B8790",
};

function stationCollection(stations: readonly DemoStation[], selectedId?: string) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [station.longitude, station.latitude] as [number, number],
      },
      properties: {
        category: station.category,
        color: CATEGORY_COLOR[station.category],
        id: station.id,
        selected: station.id === selectedId,
        heatWeight: normalizeHeatmapWeight(station.ispu),
        value: station.ispu === null ? "—" : String(station.ispu),
      },
    })),
  };
}

function formatObservationTime(value: string | null, language: Language): string {
  if (!value) return language === "id" ? "Tidak ada pengamatan" : "No observation";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-ID", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).format(parsed)} WIB`;
}

function displaySource(source: string, language: Language): string {
  if (!source) return language === "id" ? "Sumber tidak tersedia" : "Source unavailable";
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

function directSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isStaleObservation(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp > 6 * 60 * 60 * 1000;
}

function isStationCatalogResponse(value: unknown): value is StationCatalogResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const summary = record.summary;
  return (
    record.contract_version === 1 &&
    Array.isArray(record.stations) &&
    typeof summary === "object" &&
    summary !== null &&
    typeof (summary as Record<string, unknown>).station_count === "number"
  );
}

function httpsPhotoUrl(value: string | null | undefined): string | null {
  return typeof value === "string" && value.startsWith("https://") ? value : null;
}

function toMapStation(row: StationCatalogResponse["stations"][number], language: Language): DemoStation {
  return {
    category: row.category,
    district: row.district,
    id: row.id,
    ispu: row.ispu,
    latitude: row.latitude,
    longitude: row.longitude,
    name: row.name,
    observedAt: formatObservationTime(row.observed_at, language),
    pm25: row.pm25,
    source: displaySource(row.source, language),
    sourceUrl: directSourceUrl(row.source_url),
    photoUrl: httpsPhotoUrl(row.photo_url),
    photoCredit: row.photo_credit ?? null,
  };
}

export function WorkspaceMap({
  ariaLabelledBy,
  attachedKeys,
  onChipAdd,
  id,
  language,
  isMobileOverlayOpen = false,
  mobileLegendOpen = false,
  onMobileLegendClose,
  onStationClear,
  onStationSelect,
  onStationsChange,
  selectedStationId,
}: {
  readonly ariaLabelledBy?: string;
  readonly attachedKeys: ReadonlySet<string>;
  readonly onChipAdd: (chip: ContextChip) => void;
  readonly id?: string;
  readonly language: Language;
  readonly isMobileOverlayOpen?: boolean;
  readonly mobileLegendOpen?: boolean;
  readonly onMobileLegendClose?: () => void;
  readonly onStationClear: (source: "map_detail" | "chat_context") => void;
  readonly onStationSelect: (station: DemoStation, source: "map_marker" | "station_list" | "chat_picker") => void;
  readonly onStationsChange?: (stations: readonly DemoStation[]) => void;
  readonly selectedStationId?: string;
}) {
  const copy = getUiCopy(language);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const stationsRef = useRef<readonly DemoStation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [stations, setStations] = useState<readonly DemoStation[]>([]);
  const [stationSummary, setStationSummary] = useState<StationCatalogResponse["summary"]>();
  const [stationDataLoaded, setStationDataLoaded] = useState(false);
  const [stationError, setStationError] = useState(false);
  const [stationRequestKey, setStationRequestKey] = useState(0);
  const [selectedId, setSelectedId] = useState(selectedStationId);
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [layersOpen, setLayersOpen] = useState(false);
  const [stationListOpen, setStationListOpen] = useState(false);
  const [heatmapVisible, setHeatmapVisible] = useState(false);
  const [eventsVisible, setEventsVisible] = useState(false);
  const [eventPins, setEventPins] = useState<readonly EventPin[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const newsCopy = getNewsCopy(language);
  const stationDialogRef = useRef<HTMLDialogElement>(null);
  const mobileLegendDialogRef = useRef<HTMLDialogElement>(null);
  const [layers, setLayers] = useState(LAYER_DEFAULTS);

  useEffect(() => {
    setSelectedId(selectedStationId);
  }, [selectedStationId]);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    let cancelled = false;
    const loadStations = async () => {
      try {
        const response = await fetch("/api/stations?pollutant=PM2.5", { cache: "no-store" });
        if (!response.ok) throw new Error("Station data unavailable");
        const payload: unknown = await response.json();
        if (!isStationCatalogResponse(payload)) throw new Error("Invalid station data");
        const nextStations = payload.stations.map((row) => toMapStation(row, language));
        if (cancelled) return;
        setStations(nextStations);
        onStationsChange?.(nextStations);
        setStationSummary(payload.summary);
        setStationError(false);
        setStationDataLoaded(true);
      } catch {
        if (cancelled) return;
        setStations([]);
        onStationsChange?.([]);
        setStationSummary(undefined);
        setStationError(true);
        setStationDataLoaded(true);
      }
    };
    void loadStations();
    return () => {
      cancelled = true;
    };
  }, [language, onStationSelect, onStationsChange, stationRequestKey]);

  useEffect(() => {
    if (!isMobileOverlayOpen || !mapRef.current) return;
    const frame = window.requestAnimationFrame(() => mapRef.current?.resize());
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileOverlayOpen]);

  useEffect(() => {
    const dialog = stationDialogRef.current;
    if (dialog === null) return;

    if (stationListOpen && !dialog.open) {
      dialog.showModal();
    } else if (!stationListOpen && dialog.open) {
      dialog.close();
    }
  }, [stationListOpen]);

  useEffect(() => {
    const dialog = mobileLegendDialogRef.current;
    if (dialog === null) return;

    if (mobileLegendOpen && !dialog.open) {
      dialog.showModal();
    } else if (!mobileLegendOpen && dialog.open) {
      dialog.close();
    }
  }, [mobileLegendOpen]);

  const visibleStations = useMemo(
    () =>
      stations.filter(
        (station) =>
          (categoryFilter === "all" || categoryKey[station.category] === categoryFilter) &&
          (districtFilter === "all" || station.district === districtFilter),
      ),
    [categoryFilter, districtFilter, stations],
  );
  const latestObservationIsStale = isStaleObservation(stationSummary?.latest_observed_at);
  const districts = useMemo(
    () => [...new Set(stations.map((station) => station.district))].sort(),
    [stations],
  );
  const selectedStation = selectedId
    ? stations.find((station) => station.id === selectedId)
    : undefined;
  const reportingCount = stationSummary?.reporting_count ?? 0;
  const moderateCount = stationSummary?.moderate_count ?? 0;
  const unhealthyCount = stationSummary?.unhealthy_count ?? 0;
  const stationCount = stationSummary?.station_count ?? 0;
  const reportingShare = stationSummary ? percentageOf(reportingCount, stationCount) : undefined;
  const moderateShare = stationSummary ? percentageOf(moderateCount, stationCount) : undefined;
  const unhealthyShare = stationSummary ? percentageOf(unhealthyCount, stationCount) : undefined;

  const selectStation = useCallback(
    (station: DemoStation, source: "map_marker" | "station_list") => {
      setSelectedId(station.id);
      onStationSelect(station, source);
    },
    [onStationSelect],
  );

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new MapLibreMap({
      attributionControl: { compact: true },
      center: JAKARTA_CENTER,
      container: mapContainer.current,
      maxBounds: JAKARTA_BOUNDS,
      maxZoom: 15,
      minZoom: 9.1,
      style: MAP_STYLE_URL,
      zoom: 10.2,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false, showZoom: false }), "top-right");
    map.on("moveend", (event) => {
      if (event.originalEvent) trackNapasEvent("map_view_changed");
    });

    map.on("load", () => {
      map.addSource("napas-stations", {
        data: stationCollection([], selectedStationId),
        type: "geojson",
      });
      map.addLayer({
        id: STATION_HEATMAP_LAYER_ID,
        layout: { visibility: "none" },
        maxzoom: 15,
        paint: {
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
          0,
            "rgba(41, 128, 185, 0.06)",
            0.04,
            "rgba(46, 155, 120, 0.28)",
            0.14,
            "rgba(226, 169, 0, 0.46)",
            0.35,
            "rgba(217, 78, 62, 0.68)",
            0.65,
            "rgba(168, 36, 40, 0.82)",
            1,
            "rgba(122, 24, 42, 0.9)",
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            1.25,
            12,
            1.7,
            15,
            2.1,
          ],
          "heatmap-opacity": 0.92,
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            34,
            12,
            52,
            15,
            68,
          ],
          "heatmap-weight": ["get", "heatWeight"],
        },
        source: "napas-stations",
        type: "heatmap",
      });
      map.addLayer({
        id: "napas-station-halo",
        paint: {
          "circle-color": "#6DB6B0",
          "circle-opacity": ["case", ["boolean", ["get", "selected"], false], 0.24, 0],
          "circle-radius": ["case", ["boolean", ["get", "selected"], false], 34, 0],
          "circle-stroke-color": "#086B68",
          "circle-stroke-opacity": ["case", ["boolean", ["get", "selected"], false], 0.75, 0],
          "circle-stroke-width": 2,
        },
        source: "napas-stations",
        type: "circle",
      });
      map.addLayer({
        id: "napas-stations",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 10,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 2.5,
        },
        source: "napas-stations",
        type: "circle",
      });
      map.addLayer({
        id: "napas-station-values",
        layout: {
          "text-allow-overlap": true,
          "text-field": ["get", "value"],
          "text-size": 10,
        },
        paint: {
          "text-color": ["case", ["==", ["get", "category"], "Moderate"], "#172B2B", "#FFFFFF"],
        },
        source: "napas-stations",
        type: "symbol",
      });
      setMapReady(true);
    });

    const handleStationClick = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      const station = stationsRef.current.find((item) => item.id === id);
      if (station) selectStation(station, "map_marker");
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", "napas-stations", handleStationClick);
    map.on("mouseenter", "napas-stations", setPointer);
    map.on("mouseleave", "napas-stations", clearPointer);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [selectStation]);

  useEffect(() => {
    const source = mapRef.current?.getSource("napas-stations") as GeoJSONSource | undefined;
    if (!source || !mapReady) return;
    source.setData(stationCollection(visibleStations, selectedId));
  }, [mapReady, selectedId, visibleStations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map?.getLayer(STATION_HEATMAP_LAYER_ID)) return;
    map.setLayoutProperty(STATION_HEATMAP_LAYER_ID, "visibility", heatmapVisible ? "visible" : "none");
  }, [heatmapVisible, mapReady]);

  const setMapLayerVisibility = useCallback((key: MapLayerKey, visible: boolean) => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const style = map.getStyle();
    for (const layer of style.layers ?? []) {
      if (mapLayerMatches(key, layer.id)) {
        try {
          map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
        } catch {
          // Some provider layers do not expose a layout visibility property.
        }
      }
    }
  }, []);

  const toggleLayer = (key: MapLayerKey) => {
    trackNapasEvent("map_layer_toggled", {
      layer: key === "placeLabels" ? "place_labels" : key,
    });
    setLayers((current) => {
      const next = { ...current, [key]: !current[key] };
      setMapLayerVisibility(key, next[key]);
      return next;
    });
  };

  const selectedEvent = eventsVisible ? eventPins.find((pin) => pin.id === selectedEventId) : undefined;
  let pinChip: ContextChip | undefined;
  let pinLines: readonly string[] = [];
  if (selectedEvent) {
    const events = newsCopy.events;
    pinChip = eventChip(selectedEvent, language);
    pinLines = [
      `${events.reports(selectedEvent.reports)}, ${events.unverified}`,
      selectedEvent.event_start
        ? formatNewsTime(selectedEvent.event_start, language)
        : events.timeNotStated,
      events.status[selectedEvent.status] ?? events.status.unknown,
      `${events.placeFromText}: ${selectedEvent.location_text ?? "—"}`,
    ];
  } else if (selectedStation) {
    pinChip = {
      badge: selectedStation.ispu === null ? undefined : String(selectedStation.ispu),
      badgeColor: categoryBadgeColor(selectedStation.category),
      id: selectedStation.id,
      kind: "station",
      sub: `${localizedCategory(selectedStation.category, language)} · ${formatNewsTime(selectedStation.observedAt, language)}`,
      title: selectedStation.name,
    };
    pinLines = [pinChip.sub];
  }
  const pinAttached = pinChip ? attachedKeys.has(chipKey(pinChip)) : false;
  const stationDetail = selectedEvent ? undefined : selectedStation;
  const closeDetail = () => (selectedEvent ? setSelectedEventId(undefined) : onStationClear("map_detail"));
  const detailOverlay = pinChip ? (
    <aside aria-label={pinChip.title} aria-live="polite" className="detail-overlay">
      <div
        className="detail-drag"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CHIP_DRAG_TYPE, JSON.stringify(pinChip));
          event.dataTransfer.setData("text/plain", pinChip.title);
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        {stationDetail ? (
          <figure className="detail-photo-wrap">
            <div aria-label={newsCopy.detail.photoAlt} className="detail-photo" role="img">
              <CameraIcon aria-hidden="true" />
              <span>{newsCopy.detail.photo}</span>
              {stationDetail.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`${stationDetail.name}`}
                  className="detail-photo-img"
                  key={stationDetail.photoUrl}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                  referrerPolicy="no-referrer"
                  src={stationDetail.photoUrl}
                />
              ) : null}
            </div>
            {stationDetail.photoUrl && stationDetail.photoCredit ? (
              <figcaption className="detail-photo-credit">{stationDetail.photoCredit}</figcaption>
            ) : null}
          </figure>
        ) : null}
        <div className="detail-head">
          <span className="pin-card-kind">{newsCopy.chips.kinds[pinChip.kind]}</span>
        </div>
        <h3 className="detail-title">{pinChip.title}</h3>
        {stationDetail ? <p className="station-district">{localizedDistrict(stationDetail.district, language)}</p> : null}
      </div>
      <button aria-label={newsCopy.detail.close} className="detail-close" onClick={closeDetail} type="button">
        <XIcon aria-hidden="true" />
      </button>
      <div className="detail-content">
        {stationDetail ? (
          <>
            <span className={cn("category-pill", categoryKey[stationDetail.category])}>{localizedCategory(stationDetail.category, language)}</span>
            <p className="station-detail-note">{copy.map.latestLocalReading}</p>
            <div className="detail-metrics">
              <div className="detail-metric"><span>ISPU</span><strong>{stationDetail.ispu ?? "—"}</strong></div>
              <div className="detail-metric"><span>PM2.5</span><strong>{stationDetail.pm25 ?? "—"} <small>{stationDetail.pm25 === null ? "" : "µg/m³"}</small></strong></div>
            </div>
            <div className="detail-meta">
              <span>{copy.map.observed} <strong>{formatObservationTime(stationDetail.observedAt, language)}</strong></span>
              <span>
                {copy.map.source}{" "}
                {stationDetail.sourceUrl ? (
                  <a href={stationDetail.sourceUrl} rel="noopener noreferrer" target="_blank"><strong>{stationDetail.source}</strong></a>
                ) : <strong>{stationDetail.source}</strong>}
              </span>
            </div>
          </>
        ) : (
          pinLines.map((line) => <p className="pin-card-line" key={line}>{line}</p>)
        )}
      </div>
      <button
        className="pin-card-add"
        disabled={pinAttached}
        onClick={() => pinChip && onChipAdd(pinChip)}
        type="button"
      >
        {pinAttached ? newsCopy.chips.pinAdded : newsCopy.chips.addPin}
      </button>
    </aside>
  ) : null;

  return (
    <section
      aria-label={ariaLabelledBy ? undefined : copy.map.ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className="map-panel"
      id={id}
      role={ariaLabelledBy ? "tabpanel" : undefined}
      tabIndex={ariaLabelledBy ? 0 : undefined}
    >
      <header className="map-head">
        <div className="map-head-title">
          <h1>{copy.map.heading}</h1>
          <p className="map-subtitle">
            {stationSummary?.latest_observed_at
              ? `${latestObservationIsStale ? copy.map.latestAvailableStale : copy.map.latestReadings} · ${formatObservationTime(stationSummary.latest_observed_at, language)}`
              : stationError
                ? copy.map.stationReadingsUnavailable
                : copy.map.loadingReadings}
          </p>
        </div>

        <div className="map-kpis" aria-label={copy.map.summaryAria}>
          <KpiCard
            detail={stationSummary ? copy.map.stationsWithReading : copy.map.loading}
            label={copy.map.reporting}
            networkLabel={copy.map.ofNetwork}
            share={reportingShare}
            tone="reporting"
            value={stationSummary ? `${reportingCount}/${stationCount}` : "—"}
          />
          <KpiCard detail={stationSummary ? copy.map.moderateDetail : copy.map.loading} label={copy.map.moderate} networkLabel={copy.map.ofNetwork} share={moderateShare} value={stationSummary ? String(moderateCount) : "—"} tone="moderate" />
          <KpiCard detail={stationSummary ? copy.map.unhealthyDetail : copy.map.loading} label={copy.map.unhealthy} networkLabel={copy.map.ofNetwork} share={unhealthyShare} value={stationSummary ? String(unhealthyCount) : "—"} tone="unhealthy" />
        </div>

        <div className="filters" data-od-id="map-filters">
          <MapFilterDropdown
            id="air-quality-level-filter"
            icon={<WindIcon aria-hidden="true" />}
            label={copy.map.airQualityLevel}
            onChange={(value) => {
              const nextValue = value as FilterCategory;
              setCategoryFilter(nextValue);
              trackNapasEvent("map_filter_changed", { filter: "air_quality", value: nextValue });
            }}
            options={[
              { label: copy.map.allLevels, value: "all" },
              { label: copy.map.good, value: "good" },
              { label: copy.map.moderate, value: "moderate" },
              { label: copy.map.unhealthy, value: "unhealthy" },
              { label: copy.map.stale, value: "stale" },
            ]}
            value={categoryFilter}
          />
          <MapFilterDropdown
            id="district-filter"
            icon={<MapPinIcon aria-hidden="true" />}
            label={copy.map.district}
            onChange={(value) => {
              setDistrictFilter(value);
              trackNapasEvent("map_filter_changed", {
                filter: "district",
                value: value === "all" ? "all" : "specific",
              });
            }}
            options={[
              { label: copy.map.allDistricts, value: "all" },
              ...districts.map((district) => ({ label: localizedDistrict(district, language), value: district })),
            ]}
            value={districtFilter}
          />
          <button className="station-list-button" onClick={() => {
            trackNapasEvent("station_list_opened");
            setStationListOpen(true);
          }} type="button">
            <RadioTowerIcon aria-hidden="true" />
            <span>{copy.map.stationList}</span>
          </button>
        </div>
      </header>

      <div className="map-stage" data-detail={pinChip ? "open" : "closed"} id="map-stage">
        <div ref={mapContainer} aria-label={copy.map.interactiveMap} className="napas-real-map" role="region" />

        <div className="map-aids" aria-hidden="true">
          <div className="scale-aid"><div className="scale-rule" /><div className="scale-caption"><span>0</span><span>≈ 5 km</span></div></div>
          <div className="map-note">{copy.map.baseNote}</div>
        </div>
        <div className="map-controls" aria-label={copy.map.mapControls}>
          <button aria-label={copy.map.zoomIn} className="map-control" onClick={() => {
            trackNapasEvent("map_zoom_control_clicked", { direction: "in" });
            mapRef.current?.zoomIn();
          }} type="button"><PlusIcon /></button>
          <button aria-label={copy.map.zoomOut} className="map-control" onClick={() => {
            trackNapasEvent("map_zoom_control_clicked", { direction: "out" });
            mapRef.current?.zoomOut();
          }} type="button"><MinusIcon /></button>
          <button aria-controls="layers-menu" aria-expanded={layersOpen} aria-label={copy.map.mapLayers} className="map-control" onClick={() => {
            trackNapasEvent(layersOpen ? "map_layer_menu_closed" : "map_layer_menu_opened");
            setLayersOpen(!layersOpen);
          }} type="button"><Layers2Icon /></button>
        </div>

        <MapEvents
          language={language}
          map={mapReady ? mapRef.current : null}
          onEvents={setEventPins}
          onSelect={(pin) => setSelectedEventId(pin.id)}
          visible={eventsVisible}
        />
        <div aria-label={copy.map.legendAria} className="map-legend-overlay" role="group">
          <LegendContent language={language} part="key" />
        </div>
        {detailOverlay}

        {layersOpen ? (
          <div className="layers-menu" id="layers-menu" role="dialog" aria-label={copy.map.mapLayers}>
            <div className="layer-heading">{copy.map.airQuality}</div>
            <LayerToggle checked={heatmapVisible} label={copy.map.heatmap} onChange={() => {
              setHeatmapVisible((visible) => !visible);
              trackNapasEvent("map_layer_toggled", { layer: "heatmap" });
            }} />
            {heatmapVisible ? <p className="layer-note">{copy.map.heatmapDerived}</p> : null}
            <LayerToggle checked={eventsVisible} label={newsCopy.events.layer} onChange={() => {
              setEventsVisible((visible) => !visible);
              setSelectedEventId(undefined);
            }} />
            {eventsVisible ? <p className="layer-note">{newsCopy.events.source}{eventPins.length === 0 ? ` ${newsCopy.events.none}` : ""}</p> : null}
            <div className="layer-heading">{copy.map.geography}</div>
            <LayerToggle checked={layers.roads} label={copy.map.roadNetwork} onChange={() => toggleLayer("roads")} />
            <LayerToggle checked={layers.boundaries} label={copy.map.municipalityBoundaries} onChange={() => toggleLayer("boundaries")} />
            <LayerToggle checked={layers.waterways} label={copy.map.waterways} onChange={() => toggleLayer("waterways")} />
            <LayerToggle checked={layers.transit} label={copy.map.transitCorridors} onChange={() => toggleLayer("transit")} />
            <div className="layer-heading">{copy.map.labels}</div>
            <LayerToggle checked={layers.placeLabels} label={copy.map.placeLabels} onChange={() => toggleLayer("placeLabels")} />
          </div>
        ) : null}

        {!stationDataLoaded ? (
          <div className="map-empty map-status">
            <strong>{copy.map.loadingNetwork}</strong>
            <p>{copy.map.preparingNetwork}</p>
          </div>
        ) : null}

        {stationError ? (
          <div className="map-empty map-status">
            <strong>{copy.map.dataUnavailable}</strong>
            <p>{copy.map.dataUnavailableDescription}</p>
            <button onClick={() => { trackNapasEvent("map_retry_clicked"); setStationDataLoaded(false); setStationRequestKey((key) => key + 1); }} type="button">{copy.map.tryAgain}</button>
          </div>
        ) : null}

        {stationDataLoaded && !stationError && visibleStations.length === 0 ? (
          <div className="map-empty">
            <strong>{copy.map.noStationsMatch}</strong>
            <p>{copy.map.noStationsDescription}</p>
            <button onClick={() => {
              trackNapasEvent("map_filters_reset");
              setCategoryFilter("all");
              setDistrictFilter("all");
            }} type="button">{copy.map.clearFilters}</button>
          </div>
        ) : null}
      </div>

      <div className="map-dock">
        <div className="legend" aria-label={copy.map.legendAria}>
          <LegendContent language={language} part="terms" />
        </div>
      </div>

      <dialog
        aria-labelledby="mobile-legend-title"
        className="mobile-legend-dialog"
        id="mobile-legend-dialog"
        onClose={() => {
          trackNapasEvent("map_legend_closed");
          onMobileLegendClose?.();
        }}
        ref={mobileLegendDialogRef}
      >
        <div className="dialog-head">
          <div>
            <h2 id="mobile-legend-title">{copy.map.mobileLegendTitle}</h2>
            <p>{copy.map.mobileLegendDescription}</p>
          </div>
          <button
            aria-label={copy.map.closeMapLegend}
            className="dialog-close"
            onClick={() => onMobileLegendClose?.()}
            type="button"
          >
            <XIcon />
          </button>
        </div>
        <div className="mobile-legend-content">
          <LegendContent language={language} />
        </div>
      </dialog>

      <dialog
        ref={stationDialogRef}
        className="station-dialog"
        aria-labelledby="station-dialog-title"
        onClose={() => {
          trackNapasEvent("station_list_closed");
          setStationListOpen(false);
        }}
      >
          <div className="dialog-head">
            <div><h2 id="station-dialog-title">{copy.map.stationDialogTitle}</h2><p>{copy.map.stationDialogDescription}</p></div>
            <button aria-label={copy.map.closeStationList} className="dialog-close" onClick={() => setStationListOpen(false)} type="button"><XIcon /></button>
          </div>
          <div className="station-table-wrap">
            <table>
              <thead><tr><th scope="col">{copy.map.tableStation}</th><th scope="col">{copy.map.tableDistrict}</th><th scope="col">{copy.map.tableIspu}</th><th scope="col">{copy.map.tablePm25}</th><th scope="col">{copy.map.tableStatus}</th></tr></thead>
          <tbody>{visibleStations.map((station) => <tr key={station.id}><td><button className="table-station" onClick={() => { selectStation(station, "station_list"); setStationListOpen(false); }} type="button">{station.name}</button></td><td>{localizedDistrict(station.district, language)}</td><td>{station.ispu ?? "—"}</td><td>{station.pm25 === null ? "—" : `${station.pm25} µg/m³`}</td><td className={cn("table-status", categoryKey[station.category])}>{localizedCategory(station.category, language)}</td></tr>)}</tbody>
            </table>
          </div>
      </dialog>
    </section>
  );
}

function percentageOf(value: number, total: number): number | undefined {
  return total > 0 ? Math.round((value / total) * 100) : undefined;
}

function KpiCard({ detail, label, networkLabel, share, tone = "good", value }: { readonly detail: string; readonly label: string; readonly networkLabel: string; readonly share?: number; readonly tone?: "good" | "moderate" | "unhealthy" | "reporting"; readonly value: string }) {
  const progress = share ?? 0;

  return (
    <div className={cn("map-kpi", tone)}>
      <span className={cn("kpi-dot", tone)} />
      <div className="kpi-copy">
        <div className="kpi-primary-row">
          <div className="kpi-value-group">
            <strong>{value}</strong>
            <span className="kpi-label">{label}</span>
          </div>
          <span className="kpi-share"><strong>{share === undefined ? "—" : `${share}%`}</strong><small>{networkLabel}</small></span>
        </div>
        <span className="kpi-detail">{detail}</span>
        <span aria-hidden="true" className="kpi-track"><span style={{ width: `${progress}%` }} /></span>
      </div>
    </div>
  );
}

/** `part` lets the map show the colour and map keys over the map and keep the definitions below it. */
function LegendContent({ language, part = "all" }: { readonly language: Language; readonly part?: "all" | "key" | "terms" }) {
  const copy = getUiCopy(language);
  const events = getNewsCopy(language).events;
  const termDefinitions = (
    <dl className="legend-terms" aria-label={copy.map.airQualityLevel}>
      <div className="legend-term">
        <dt>{copy.map.ispuTerm}</dt>
        <dd>{copy.map.ispuDefinition}</dd>
      </div>
      <div className="legend-term">
        <dt>{copy.map.pm25Term}</dt>
        <dd>{copy.map.pm25Definition}</dd>
      </div>
      <div className="legend-term">
        <dt>{copy.map.stationReadingTerm}</dt>
        <dd>{copy.map.stationReadingDefinition}</dd>
      </div>
    </dl>
  );
  if (part === "terms") return termDefinitions;
  return (
    <>
      <h3>{copy.map.legendTitle}</h3>
      <div className="legend-grid">
        <LegendItem color="good" label={copy.map.good} range="0–50" />
        <LegendItem color="moderate" label={copy.map.moderate} range="51–100" />
        <LegendItem color="unhealthy" label={copy.map.unhealthy} range="101–200" />
        <LegendItem color="stale" label={copy.map.staleMissing} />
      </div>
      <div className="legend-key" aria-label={copy.map.geography}>
        <span><i className="key-water" />{copy.map.waterway}</span>
        <span><i className="key-road" />{copy.map.primaryRoad}</span>
        <span><i className="key-transit" />{copy.map.transit}</span>
        <span><i className="key-landmark" />{copy.map.landmark}</span>
        <span><i className="key-event" />{events.legend}</span>
      </div>
      {part === "all" ? termDefinitions : null}
    </>
  );
}

function LegendItem({ color, label, range }: { readonly color: string; readonly label: string; readonly range?: string }) {
  return <div className="legend-item"><i className={`legend-dot ${color}`} /><span>{label} {range ? <small>{range}</small> : null}</span></div>;
}

function LayerToggle({ checked, label, onChange }: { readonly checked: boolean; readonly label: string; readonly onChange: () => void }) {
  return <label className="layer-toggle"><input checked={checked} onChange={onChange} type="checkbox" />{label}</label>;
}
