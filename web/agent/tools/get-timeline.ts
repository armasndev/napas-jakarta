import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchNapasJson } from "@/lib/server-api";

const timelineResponseSchema = z
  .object({ entries: z.array(z.record(z.string(), z.unknown())) })
  .passthrough();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export default defineTool({
  description:
    "Query the hand-curated timeline of notable Jakarta air-quality, policy and protest events. Entries are curated context with dated sources, not live data. Never extend a timeline entry from memory; report only what an entry says and cite its date and sources.",
  inputSchema: z.object({
    category: z.enum(["Policy", "Protest", "Incident", "Study"]).optional(),
    end: isoDate.optional(),
    language: z.enum(["en", "id"]).default("en"),
    limit: z.number().int().min(1).max(20).default(8),
    start: isoDate.optional(),
    text: z.string().max(200).optional(),
  }),
  async execute({ category, end, language, limit, start, text }) {
    const response = await fetchNapasJson<unknown>("/timeline/query", {
      body: JSON.stringify({ category, end, language, limit, start, text }),
      method: "POST",
    });
    const payload = timelineResponseSchema.parse(response);
    return { entries: payload.entries, kind: "timeline", language };
  },
});
