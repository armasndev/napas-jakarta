import { languageParam } from "@/lib/news";
import { relayToApi } from "@/lib/news-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const language = languageParam(new URL(request.url).searchParams.get("language"));
  return relayToApi(`/timeline?language=${language}`, {}, "timeline_unavailable");
}
