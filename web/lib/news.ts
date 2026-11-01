import type { Language } from "./i18n";

export type NewsTopic = "PROTEST" | "TRAFFIC" | "POLICY" | "HEALTH" | "ENVIRONMENT" | "OTHER";

export type NewsItem = {
  readonly id: string;
  readonly lang: Language;
  readonly outlet: string;
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
  readonly topic: NewsTopic;
  readonly published_at: string | null;
  readonly demo: boolean;
};

export type EventPin = {
  readonly id: string;
  readonly title: string;
  readonly topic: NewsTopic;
  readonly lat: number;
  readonly lng: number;
  readonly location_text: string | null;
  readonly precision: "point" | "district" | null;
  readonly status: "planned" | "ongoing" | "over" | "unknown";
  readonly event_start: string | null;
  readonly event_end: string | null;
  readonly published_at: string | null;
  readonly reports: number;
  readonly outlets: readonly string[];
  readonly demo: boolean;
};

export type TimelineEntry = {
  readonly id: string;
  readonly date: string;
  readonly category: string | null;
  readonly title: string;
  readonly summary: string;
  readonly sources: readonly string[];
  readonly demo: boolean;
};

/** What a chip can point at. Only the kind and id ever identify the stored record. */
export type ChipKind = "article" | "station" | "event";

export type ContextChip = {
  readonly kind: ChipKind;
  readonly id: string;
  readonly title: string;
  readonly sub: string;
  /** Short badge, e.g. the ISPU value for a station. */
  readonly badge?: string;
  readonly badgeColor?: string;
};

export type ResolvedContext = {
  readonly kind: ChipKind;
  readonly id: string;
  readonly available: boolean;
  readonly title: string;
  readonly sub: string;
  readonly text: string;
  readonly url?: string;
};

export const MAX_CONTEXT_CHIPS = 4;
export const CHIP_DRAG_TYPE = "application/x-napas-chip";

export function chipKey(chip: Pick<ContextChip, "kind" | "id">): string {
  return `${chip.kind}:${chip.id}`;
}

/** Add a chip if there is room and it is new. */
export function addChip(
  chips: readonly ContextChip[],
  chip: ContextChip,
): { readonly chips: readonly ContextChip[]; readonly result: "added" | "duplicate" | "limit" } {
  if (chips.some((existing) => chipKey(existing) === chipKey(chip))) return { chips, result: "duplicate" };
  if (chips.length >= MAX_CONTEXT_CHIPS) return { chips, result: "limit" };
  return { chips: [...chips, chip], result: "added" };
}

export function parseChipDrop(raw: string): ContextChip | undefined {
  try {
    const value = JSON.parse(raw) as Partial<ContextChip>;
    if (
      (value.kind === "article" || value.kind === "station" || value.kind === "event") &&
      typeof value.id === "string" && /^[A-Za-z0-9._:-]{1,120}$/u.test(value.id) &&
      typeof value.title === "string" && typeof value.sub === "string"
    ) {
      return {
        badge: typeof value.badge === "string" ? value.badge.slice(0, 8) : undefined,
        badgeColor: typeof value.badgeColor === "string" ? value.badgeColor.slice(0, 16) : undefined,
        id: value.id,
        kind: value.kind,
        sub: value.sub.slice(0, 160),
        title: value.title.slice(0, 200),
      };
    }
  } catch {
    // Not one of our chips; ignore the drop.
  }
  return undefined;
}

export function languageParam(value: string | null): Language {
  return value === "id" ? "id" : "en";
}
