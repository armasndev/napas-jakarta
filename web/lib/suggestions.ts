import type { Language } from "./i18n";

type SuggestionTopic = {
  readonly label: string;
  readonly suggestedQuestion: string;
};

const DEFAULT_SUGGESTED_QUESTIONS = [
  "Where is air quality worst right now?",
  "Compare north and south Jakarta",
  "Is it safe to exercise outside?",
] as const;

const DEFAULT_SUGGESTED_QUESTIONS_ID = [
  "Di mana kualitas udara paling buruk saat ini?",
  "Bandingkan Jakarta Utara dan Jakarta Selatan",
  "Apakah aman berolahraga di luar?",
] as const;

function contextualizeTopicQuestion(question: string, location: string, language: Language): string {
  const withoutQuestionMark = question.replace(/[?]+$/, "");
  const lowerQuestion = `${withoutQuestionMark.charAt(0).toLowerCase()}${withoutQuestionMark.slice(1)}`;
  return language === "id" ? `Di ${location}, ${lowerQuestion}?` : `At ${location}, ${lowerQuestion}?`;
}

export function getSuggestedQuestions(
  topic: SuggestionTopic | undefined,
  station: string | undefined,
  language: Language = "en",
): string[] {
  const location = station?.trim();

  if (topic && location) {
    return [
      contextualizeTopicQuestion(topic.suggestedQuestion, location, language),
      language === "id"
        ? `Apa arti pembacaan kualitas udara di ${location} untuk ${topic.label.toLowerCase()}?`
        : `What does the air quality reading at ${location} mean for ${topic.label.toLowerCase()}?`,
      language === "id"
        ? `Apa yang perlu saya ketahui tentang ${topic.label.toLowerCase()} saat menggunakan pembacaan dari ${location}?`
        : `What should I know about ${topic.label.toLowerCase()} when using the ${location} reading?`,
    ];
  }

  if (topic) {
    return [
      topic.suggestedQuestion,
      language === "id"
        ? `Apa yang perlu saya ketahui sebelum mengambil tindakan terkait ${topic.label.toLowerCase()}?`
        : `What should I know before acting on ${topic.label.toLowerCase()}?`,
      language === "id" ? "Sumber apa yang mendukung topik ini?" : "Which sources support this topic?",
    ];
  }

  if (location) {
    return [
      language === "id" ? `Bagaimana kualitas udara terbaru di ${location}?` : `What is the latest air quality at ${location}?`,
      language === "id"
        ? `Bagaimana perbandingan ${location} dengan stasiun di sekitarnya?`
        : `How does ${location} compare with nearby stations?`,
      language === "id"
        ? `Apa yang perlu saya ketahui tentang pembacaan stasiun ${location}?`
        : `What should I know about the ${location} station’s reading?`,
    ];
  }

  return [...(language === "id" ? DEFAULT_SUGGESTED_QUESTIONS_ID : DEFAULT_SUGGESTED_QUESTIONS)];
}

export type SuggestionPlan = "premade" | "generate";

/**
 * Premade questions cover no station, one station and exactly two stations. Anything with an
 * attached article, event or pin, or more than two stations, gets questions generated for it.
 */
export function suggestionPlan(input: {
  readonly stationCount: number;
  readonly attachmentCount: number;
}): SuggestionPlan {
  return input.attachmentCount > 0 || input.stationCount > 2 ? "generate" : "premade";
}

export function getPairSuggestions(first: string, second: string, language: Language = "en"): string[] {
  return language === "id"
    ? [
        `Bagaimana perbandingan kualitas udara di ${first} dan ${second} saat ini?`,
        `Mana yang lebih buruk sekarang, ${first} atau ${second}?`,
        `Apakah lebih aman berolahraga di luar di ${first} atau ${second}?`,
      ]
    : [
        `How does air quality at ${first} compare with ${second} right now?`,
        `Which is worse at the moment, ${first} or ${second}?`,
        `Is it safer to exercise outside at ${first} or ${second}?`,
      ];
}

/** Shown straight away while generated questions load, and if generation fails. */
export function getContextFallbackSuggestions(language: Language = "en"): string[] {
  return language === "id"
    ? [
        "Ringkas ini dan jelaskan pengaruhnya bagi saya.",
        "Apa yang perlu saya ketahui tentang yang saya lampirkan?",
        "Apa yang tidak ditunjukkan oleh sumber-sumber ini?",
      ]
    : [
        "Summarise this and tell me how it affects me.",
        "What should I know about what I attached?",
        "What do these sources not show?",
      ];
}

const MAX_GENERATED = 3;
const MAX_GENERATED_LENGTH = 120;

/** Accept only short, plain questions from the model; drop anything else. */
export function sanitizeGeneratedSuggestions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/gu, " ").trim();
    const key = text.toLowerCase();
    if (text.length < 8 || text.length > MAX_GENERATED_LENGTH || seen.has(key)) continue;
    if (/https?:|www\.|<|>|[`{}]/iu.test(text) || !/[?？]$/u.test(text)) continue;
    seen.add(key);
    clean.push(text);
    if (clean.length === MAX_GENERATED) break;
  }
  return clean;
}
