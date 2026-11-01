import { NextResponse } from "next/server";
import { fetchApiWithWake, internalApiHeaders, napasApiOrigin } from "@/lib/server-api";

/** Forward a request to the private API and return its JSON, or a short error. */
export async function relayToApi(path: string, init: RequestInit = {}, errorCode = "news_unavailable") {
  const origin = napasApiOrigin();
  if (!origin) return NextResponse.json({ error: errorCode }, { status: 503 });
  try {
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(internalApiHeaders())) headers.set(name, value);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetchApiWithWake(`${origin}${path}`, { ...init, cache: "no-store", headers });
    if (!response.ok) return NextResponse.json({ error: errorCode }, { status: 502 });
    return new NextResponse(await response.text(), { headers: { "content-type": "application/json" } });
  } catch {
    return NextResponse.json({ error: errorCode }, { status: 503 });
  }
}
