import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { emitServerException, emitServerLog } from "../lib/server-logger.ts";
import { guardedModel } from "./guard.ts";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 120_000;

export function selectGeminiModel(configured: string | undefined): string {
  return configured?.trim() || DEFAULT_GEMINI_MODEL;
}

export function selectGeminiRequestTimeout(configured: string | undefined): number {
  const parsed = Number.parseInt(configured ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
}

export function classifyGeminiFailure(error: unknown, status?: number): string {
  if (status === 429) return "rate_limited";
  if (typeof status === "number" && status >= 500) return "upstream_5xx";
  if (typeof status === "number" && status >= 400) return "upstream_4xx";
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "aborted";
  return "request_failed";
}

export function createNapasModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const requestTimeoutMs = selectGeminiRequestTimeout(process.env.GEMINI_REQUEST_TIMEOUT_MS);
  const google = createGoogleGenerativeAI({
    apiKey: apiKey ?? "",
    fetch: async (input, init) => {
      if (apiKey === undefined) {
        emitServerLog("error", "provider_configuration_missing", {
          dependency: "gemini",
          critical: true,
          alertable: true,
        });
        throw new Error("GEMINI_API_KEY is not configured.");
      }

      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      const signal = init?.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;

      const providerRequestId = crypto.randomUUID();
      try {
        const providerRequestStartedAt = Date.now();
        emitServerLog("info", "gemini_request_started", {
          model: selectGeminiModel(process.env.GEMINI_MODEL),
          provider_request_id: providerRequestId,
        });
        const response = await fetch(input, { ...init, signal });
        if (!response.ok) {
          emitServerLog("error", "provider_failure", {
            dependency: "gemini",
            error_code: classifyGeminiFailure(undefined, response.status),
            http_status: response.status,
            provider_request_id: providerRequestId,
            critical: true,
            alertable: true,
          });
        }
        return observeGeminiResponse(response, providerRequestId, providerRequestStartedAt);
      } catch (error: unknown) {
        emitServerException("error", "provider_failure", error, {
          dependency: "gemini",
          error_code: classifyGeminiFailure(error),
          provider_request_id: providerRequestId,
          critical: true,
          alertable: true,
        });
        throw error;
      }
    },
  });

  return guardedModel(google(selectGeminiModel(process.env.GEMINI_MODEL)));
}

function observeGeminiResponse(response: Response, providerRequestId: string, startedAt: number): Response {
  if (!response.body || typeof response.body.tee !== "function") return response;

  const [providerBody, observationBody] = response.body.tee();
  void observeGeminiBody(observationBody, providerRequestId, startedAt);
  return new Response(providerBody, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function observeGeminiBody(
  body: ReadableStream<Uint8Array>,
  providerRequestId: string,
  startedAt: number,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let providerByteLogged = false;
  let streamedTokenLogged = false;

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buffer += decoder.decode();
        if (!streamedTokenLogged && containsGeminiText(buffer)) {
          emitServerLog("info", "gemini_first_streamed_token", {
            duration_ms: Date.now() - startedAt,
            provider_request_id: providerRequestId,
          });
        }
        return;
      }
      if (!chunk.value || chunk.value.byteLength === 0) continue;

      if (!providerByteLogged) {
        providerByteLogged = true;
        emitServerLog("info", "gemini_first_provider_byte", {
          duration_ms: Date.now() - startedAt,
          provider_request_id: providerRequestId,
        });
      }

      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";
      if (!streamedTokenLogged && lines.some(containsGeminiText)) {
        streamedTokenLogged = true;
        emitServerLog("info", "gemini_first_streamed_token", {
          duration_ms: Date.now() - startedAt,
          provider_request_id: providerRequestId,
        });
      }
    }
  } catch {
    // Observability must never affect provider streaming or user-visible chat.
  } finally {
    reader.releaseLock();
  }
}

function containsGeminiText(line: string): boolean {
  const payload = line.trim().replace(/^data:\s*/u, "");
  if (!payload || payload === "[DONE]") return false;

  try {
    const parsed = JSON.parse(payload) as {
      candidates?: readonly {
        content?: { parts?: readonly { text?: unknown }[] };
      }[];
    };
    return Boolean(parsed.candidates?.some((candidate) =>
      candidate.content?.parts?.some((part) => typeof part.text === "string" && part.text.length > 0),
    ));
  } catch {
    return false;
  }
}
