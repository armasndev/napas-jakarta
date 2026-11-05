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
