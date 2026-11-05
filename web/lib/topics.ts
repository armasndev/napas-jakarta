import topicCatalog from "./topics.json";
import { localizedSourceLabel, type Language } from "./i18n";

export type TopicCopy = {
  readonly label: string;
  readonly description: string;
  readonly suggestedQuestion: string;
};

export type TopicOption = TopicCopy & {
  readonly id: string;
  readonly sourceIds: readonly string[];
  readonly reviewStatus?: "clinical-review-required";
  readonly indonesian: TopicCopy;
};

export type TopicGroup = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly indonesian: Pick<TopicCopy, "label" | "description">;
  readonly topics: readonly TopicOption[];
};

type TopicCatalog = {
  readonly sourceLabels: Readonly<Record<string, string>>;
  readonly groups: readonly TopicGroup[];
};

export const TOPIC_CATALOG = topicCatalog as TopicCatalog;
export const TOPIC_GROUPS = TOPIC_CATALOG.groups;
export const TOPIC_SOURCE_LABELS = TOPIC_CATALOG.sourceLabels;

export type NapasClientContext = {
  readonly napas: {
    readonly language: Language;
    readonly selectedTopic: {
      readonly id: string;
      readonly label: string;
      readonly sourceIds: readonly string[];
      readonly reviewStatus?: string;
    } | null;
    readonly selectedStation: string | null;
  };
};

export function getLocalizedTopicCopy(topic: TopicOption, language: Language): TopicCopy {
  return language === "id" ? topic.indonesian : topic;
}

export function getLocalizedTopicGroupCopy(
  group: TopicGroup,
  language: Language,
): Pick<TopicCopy, "label" | "description"> {
  return language === "id" ? group.indonesian : group;
}

export function getTopicSourceLabels(topic: TopicOption, language: Language = "en"): string[] {
  return topic.sourceIds.map((sourceId) =>
    localizedSourceLabel(sourceId, TOPIC_SOURCE_LABELS[sourceId] ?? sourceId, language),
  );
}

export function findTopic(topicId: string | undefined): TopicOption | undefined {
  if (!topicId) return undefined;
  return TOPIC_GROUPS.flatMap((group) => group.topics).find((topic) => topic.id === topicId);
}

export function buildNapasClientContext(
  selectedTopic: TopicOption | undefined,
  selectedStation: string | undefined,
  language: Language = "en",
): NapasClientContext {
  const localizedTopic = selectedTopic ? getLocalizedTopicCopy(selectedTopic, language) : undefined;

  return {
    napas: {
      language,
      selectedTopic: selectedTopic
        ? {
            id: selectedTopic.id,
            label: localizedTopic?.label ?? selectedTopic.label,
            sourceIds: selectedTopic.sourceIds,
            ...(selectedTopic.reviewStatus ? { reviewStatus: selectedTopic.reviewStatus } : {}),
          }
        : null,
      selectedStation: selectedStation ?? null,
    },
  };
}
