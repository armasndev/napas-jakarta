import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchNapasJson } from "@/lib/server-api";

const newsResponseSchema = z
  .object({
    results: z.array(z.record(z.string(), z.unknown())),
    source_mode: z.string(),
  })
  .passthrough();

export default defineTool({
  description:
    "Search recent Jakarta news the app has collected (protests, closures, incidents, announcements). News is event context only: it says what was reported and when, never what the air quality is or what caused it. Search in the viewer's language. Cite outlet and time, and say when nothing relevant is returned.",
  inputSchema: z.object({
    language: z.enum(["en", "id"]).default("en"),
    limit: z.number().int().min(1).max(8).default(5),
    query: z.string().min(2).max(300),
  }),
  async execute({ language, limit, query }) {
    const response = await fetchNapasJson<unknown>("/news/search", {
      body: JSON.stringify({ language, limit, query }),
      method: "POST",
    });
    const payload = newsResponseSchema.parse(response);
    return {
      kind: "news",
      language,
      results: payload.results.map((item) => ({
        excerpt: item.excerpt,
        id: item.id,
        outlet: item.outlet,
        publishedAt: item.published_at,
        title: item.title,
        topic: item.topic,
        url: item.url,
      })),
      sourceMode: payload.source_mode,
    };
  },
});
