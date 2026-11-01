import { languageParam } from "@/lib/news";
import { relayToApi } from "@/lib/news-api";

export const dynamic = "force-dynamic";

const TOPICS = new Set(["PROTEST", "TRAFFIC", "POLICY", "HEALTH", "ENVIRONMENT", "OTHER"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams({ language: languageParam(params.get("language")), limit: "50" });
  const topic = params.get("topic")?.toUpperCase();
  if (topic && TOPICS.has(topic)) query.set("topic", topic);
  return relayToApi(`/news?${query.toString()}`);
}
