import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { chatGlobalRateLimiter, chatRateLimiter, requestClientKey } from "@/lib/request-rate-limit";
import { validateEveRequestPayload } from "@/lib/user-input-limits";

const MAX_CHAT_REQUEST_BYTES = 32_000;
const EVE_TURN_PATH = /^\/eve\/v1\/session(?:\/[^/]+)?$/u;

// TEMPORARY dev-only gate: delete before dev replaces main (`git revert dcbf95e`); CI blocks PRs to
// main while DEV_ACCESS_PASSWORD appears in web/. When DEV_ACCESS_PASSWORD is set, every page needs HTTP basic auth (any username).
function devGate(request: NextRequest): NextResponse | undefined {
  const password = process.env.DEV_ACCESS_PASSWORD;
  if (!password) return undefined;
  const supplied = atob((request.headers.get("authorization") ?? "").replace(/^Basic /u, "") || "Og==");
  if (supplied.slice(supplied.indexOf(":") + 1) === password) return undefined;
  return new NextResponse("Password required.", {
    headers: { "Cache-Control": "no-store", "WWW-Authenticate": 'Basic realm="Napas dev"' },
    status: 401,
  });
}

export async function proxy(request: NextRequest) {
  const denied = devGate(request);
  if (denied) return denied;

  const routerHost = process.env.VERCEL_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.__VERCEL_DEV_RUNNING === "1" && routerHost && forwardedHost !== routerHost) {
    const target = request.nextUrl.clone();
    target.protocol = "http:";
    target.host = routerHost;
    return NextResponse.redirect(target);
  }

  if (request.method === "POST" && EVE_TURN_PATH.test(request.nextUrl.pathname)) {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_CHAT_REQUEST_BYTES) {
      return NextResponse.json({ error: "Chat request is too large." }, { status: 413 });
    }

    const rawBody = await request.clone().text().catch(() => "");
    if (new TextEncoder().encode(rawBody).byteLength > MAX_CHAT_REQUEST_BYTES) {
      return NextResponse.json({ error: "Chat request is too large." }, { status: 413 });
    }

    let payload: unknown;
    try {
      payload = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      // Leave malformed JSON handling to Eve so it keeps its normal error
      // contract. The guard only inspects valid request objects.
      payload = undefined;
    }

    const inputViolation = validateEveRequestPayload(payload);
    if (inputViolation) {
      const error =
        inputViolation === "word-limit"
          ? "Chat message is limited to 500 words."
          : inputViolation === "character-limit"
            ? "Chat message is too long."
            : "Chat context is too large.";
      return NextResponse.json(
        { code: "chat_input_too_large", error },
        { headers: { "Cache-Control": "no-store" }, status: 413 },
      );
    }

    const clientKey = requestClientKey(request);
    const clientDecision = chatRateLimiter.allow(clientKey);
    const globalDecision = clientDecision.allowed
      ? chatGlobalRateLimiter.allow("all-chat")
      : clientDecision;
    const decision = clientDecision.allowed ? globalDecision : clientDecision;
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "Too many chat requests. Please try again shortly." },
        {
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(decision.retryAfterSeconds),
          },
          status: 429,
        },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  // Health stays open for Railway; everything else passes through the dev gate.
  matcher: ["/((?!api/health|_next/static|_next/image).*)"],
};
