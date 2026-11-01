"use client";

import { XIcon } from "lucide-react";
import type { DragEvent } from "react";
import { CHIP_DRAG_TYPE, type ContextChip } from "@/lib/news";
import { getNewsCopy } from "@/lib/news-copy";
import type { Language } from "@/lib/i18n";

/** Props that make any element a drag source for a chat chip. */
export function chipDragProps(chip: ContextChip) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData(CHIP_DRAG_TYPE, JSON.stringify(chip));
      event.dataTransfer.setData("text/plain", chip.title);
      event.dataTransfer.effectAllowed = "copy";
    },
  };
}

function badgeTextColor(background: string): string {
  return background.toLowerCase() === "#e3b800" ? "#15171a" : "#ffffff";
}

export function ChipCard({
  chip,
  language,
  onRemove,
  unavailable = false,
}: {
  readonly chip: ContextChip;
  readonly language: Language;
  readonly onRemove?: () => void;
  readonly unavailable?: boolean;
}) {
  const copy = getNewsCopy(language).chips;
  return (
    <div className="chip-card" data-kind={chip.kind} data-unavailable={unavailable ? "true" : undefined}>
      <div className="chip-card-body">
        <div className="chip-card-head">
          <span aria-hidden="true" className="chip-mark" data-kind={chip.kind} />
          <span className="chip-kind">{copy.kinds[chip.kind]}{unavailable ? ` · ${copy.unavailable}` : ""}</span>
          {chip.badge ? (
            <span
              className="chip-badge"
              style={{ background: chip.badgeColor ?? "#15171a", color: badgeTextColor(chip.badgeColor ?? "#15171a") }}
            >
              {chip.badge}
            </span>
          ) : null}
        </div>
        <span className="chip-title">{chip.title}</span>
        <span className="chip-sub">{chip.sub}</span>
      </div>
      {onRemove ? (
        <button aria-label={copy.remove(chip.title)} className="chip-remove" onClick={onRemove} type="button">
          <XIcon aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Compact attachment row: one pill per chip, the same height as the suggested questions. */
export function ChipPills({
  chips,
  language,
  onRemove,
}: {
  readonly chips: readonly ContextChip[];
  readonly language: Language;
  readonly onRemove: (chip: ContextChip) => void;
}) {
  const copy = getNewsCopy(language).chips;
  if (chips.length === 0) return null;
  return (
    <div
      aria-label={`${copy.trayLabel}, ${chips.length}`}
      className="napas-attach-row"
      data-multi={chips.length > 1 ? "true" : "false"}
      role="group"
    >
      {chips.map((chip) => (
        <span className="chip-pill" data-kind={chip.kind} key={`${chip.kind}:${chip.id}`} title={chip.title}>
          <span aria-hidden="true" className="chip-mark" data-kind={chip.kind} />
          {chips.length === 1 ? <span className="chip-kind">{copy.kinds[chip.kind]}</span> : null}
          <span className="chip-pill-title">{chip.title}</span>
          <button aria-label={copy.remove(chip.title)} className="chip-remove" onClick={() => onRemove(chip)} type="button">
            <XIcon aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function SentChips({ chips, language }: { readonly chips: readonly ContextChip[]; readonly language: Language }) {
  if (chips.length === 0) return null;
  return (
    <div className="sent-chips">
      {chips.map((chip) => (
        <ChipCard chip={chip} key={`${chip.kind}:${chip.id}`} language={language} />
      ))}
    </div>
  );
}
