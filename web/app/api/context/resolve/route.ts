import { NextResponse } from "next/server";
import { MAX_CONTEXT_CHIPS, languageParam } from "@/lib/news";
import { relayToApi } from "@/lib/news-api";

export const dynamic = "force-dynamic";

const KINDS = new Set(["article", "event", "station"]);
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/u;

/** Resolve typed chip refs to stored records. The browser never supplies chip text. */
export async function POST(request: Request) {
  let body: { refs?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const refs = Array.isArray(body.refs) ? body.refs : [];
  const clean = refs
    .filter(
      (ref): ref is { kind: string; id: string } =>
        typeof ref === "object" && ref !== null &&
        KINDS.has((ref as { kind?: string }).kind ?? "") &&
        ID_PATTERN.test(String((ref as { id?: unknown }).id ?? "")),
    )
    .slice(0, MAX_CONTEXT_CHIPS)
    .map((ref) => ({ id: ref.id, kind: ref.kind }));
  if (clean.length === 0) return NextResponse.json({ items: [] });
  const language = languageParam(typeof body.language === "string" ? body.language : null);
  return relayToApi(
    "/context/resolve",
    { body: JSON.stringify({ language, refs: clean }), method: "POST" },
    "context_unavailable",
  );
}
