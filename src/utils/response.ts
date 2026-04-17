import { REQUEST_ID_HEADER } from "./headers";
import type { SseFrame } from "./stream";
import { toSseStream } from "./stream";

const TEXT_ENCODER = new TextEncoder();

const RESPONSE_HEADER_ALLOWLIST = ["retry-after", "retry-after-ms", "x-should-retry"] as const;

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 502, 503]);

const DEFAULT_RETRY_AFTER_MS = "1000";

export const filterResponseHeaders = (
  upstream?: Record<string, string>,
): Record<string, string> | undefined => {
  if (!upstream) return undefined;

  let filtered: Record<string, string> | undefined;
  for (const key of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstream[key];
    if (value !== undefined) {
      filtered ??= {};
      filtered[key] = value;
    }
  }
  return filtered;
};

export const buildRetryHeaders = (
  status: number,
  upstream?: Record<string, string>,
): Record<string, string> => {
  const filtered = filterResponseHeaders(upstream);

  if (!RETRYABLE_STATUS_CODES.has(status)) {
    if (filtered?.["x-should-retry"] !== undefined) return filtered;
    const result: Record<string, string> = { "x-should-retry": "false" };
    if (filtered) {
      for (const key in filtered) result[key] = filtered[key]!;
    }
    return result;
  }

  const hasTimingHint =
    filtered?.["retry-after"] !== undefined || filtered?.["retry-after-ms"] !== undefined;
  const shouldRetry = filtered?.["x-should-retry"];

  if (filtered && hasTimingHint && shouldRetry !== undefined) return filtered;

  const result: Record<string, string> = {};
  if (filtered) {
    for (const key in filtered) result[key] = filtered[key]!;
  }
  if (!hasTimingHint) result["retry-after-ms"] = DEFAULT_RETRY_AFTER_MS;
  if (shouldRetry === undefined) result["x-should-retry"] = "true";
  return result;
};

export const prepareResponseInit = (requestId: string): ResponseInit => ({
  headers: { [REQUEST_ID_HEADER]: requestId },
});

export const mergeResponseInit = (
  defaultHeaders: HeadersInit,
  responseInit?: ResponseInit,
): ResponseInit => {
  const headers = new Headers(defaultHeaders);
  const override = responseInit?.headers;
  if (override) {
    new Headers(override).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (!responseInit) return { headers };

  return {
    status: responseInit.status,
    statusText: responseInit.statusText,
    headers,
  };
};

export const toResponse = (
  result: ReadableStream<SseFrame> | Uint8Array<ArrayBuffer> | object | string,
  responseInit?: ResponseInit,
  streamOptions?: {
    onDone?: (status: number, reason?: unknown) => void;
    formatError?: (error: unknown) => unknown;
  },
): Response => {
  let body: BodyInit;
  const isStream = result instanceof ReadableStream;

  if (isStream) {
    body = toSseStream(result, streamOptions);
  } else if (result instanceof Uint8Array) {
    body = result;
  } else if (typeof result === "string") {
    body = TEXT_ENCODER.encode(result);
  } else {
    body = TEXT_ENCODER.encode(JSON.stringify(result));
  }

  if (!responseInit?.statusText) {
    const status = responseInit?.status ?? 200;
    const statusText = "OK";
    const headers = responseInit?.headers;

    responseInit = headers ? { status, statusText, headers } : { status, statusText };
  }

  const init = mergeResponseInit(
    isStream
      ? {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        }
      : {
          "content-type": "application/json",
          "content-length": String((body as Uint8Array).byteLength),
        },
    responseInit,
  );

  return new Response(body, init);
};
