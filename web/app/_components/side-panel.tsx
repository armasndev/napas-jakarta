"use client";

import { XIcon } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { Language } from "@/lib/i18n";
import type { ContextChip } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";
import { NewsPanel } from "./news-panel";

export type PanelTab = "news" | "map" | "timeline";
// shortcut: the Timeline tab is hidden until data/timeline.json holds real entries; add "timeline" back here and in the panes below.
const TABS: readonly PanelTab[] = ["news", "map"];

/**
 * Right-hand panel: News, Map and Timeline tabs next to the always-present chat.
 * All three panes stay mounted (the map keeps its size and state); only the active one is shown.
 */
export function SidePanel({
  attachedKeys,
  language,
  map,
  onChipAdd,
  onClose,
  onTabChange,
  tab,
}: {
  readonly attachedKeys: ReadonlySet<string>;
  readonly language: Language;
  readonly map: ReactNode;
  readonly onChipAdd: (chip: ContextChip) => void;
  readonly onClose: () => void;
  readonly onTabChange: (tab: PanelTab) => void;
  readonly tab: PanelTab;
}) {
  const copy = getNewsCopy(language).panel;
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    let next: PanelTab | undefined;
    if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    else if (event.key === "ArrowLeft") next = TABS[(index + TABS.length - 1) % TABS.length];
    else if (event.key === "Home") next = TABS[0];
    else if (event.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    onTabChange(next);
    tabRefs.current[next]?.focus();
  };

  const pane = (id: PanelTab, content: ReactNode) => (
    <div
      aria-labelledby={`panel-tab-${id}`}
      className="side-pane"
      data-active={tab === id ? "true" : "false"}
      id={`panel-${id}`}
      inert={tab !== id}
      role="tabpanel"
    >
      {content}
    </div>
  );

  return (
    <aside aria-label={copy.label} className="side-panel" id="map-panel">
      <div className="side-tabs-bar">
        <div aria-label={copy.label} className="side-tabs" onKeyDown={onKeyDown} role="tablist">
          {TABS.map((id) => (
            <button
              aria-controls={`panel-${id}`}
              aria-selected={tab === id}
              className="side-tab"
              id={`panel-tab-${id}`}
              key={id}
              onClick={() => onTabChange(id)}
              ref={(node) => {
                tabRefs.current[id] = node;
              }}
              role="tab"
              tabIndex={tab === id ? 0 : -1}
              type="button"
            >
              {copy[id]}
            </button>
          ))}
        </div>
        <button aria-label={copy.close} className="side-close" onClick={onClose} type="button">
          <XIcon aria-hidden="true" />
        </button>
      </div>
      <div className="side-panes">
        {pane("news", <NewsPanel attachedKeys={attachedKeys} language={language} onAdd={onChipAdd} />)}
        {pane("map", map)}
      </div>
    </aside>
  );
}
