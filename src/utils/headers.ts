export const REQUEST_ID_HEADER = "x-request-id";
export const RETRY_AFTER_HEADER = "retry-after";
export const RETRY_AFTER_MS_HEADER = "retry-after-ms";
export const X_SHOULD_RETRY_HEADER = "x-should-retry";

const RESPONSE_HEADER_ALLOWLIST = [
  RETRY_AFTER_HEADER,
  RETRY_AFTER_MS_HEADER,
  X_SHOULD_RETRY_HEADER,
] as const;

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

const DEFAULT_RETRY_AFTER_MS = 1000;

type HeaderSource = Request | ResponseInit | undefined;

export const resolveRequestId = (source: HeaderSource): string | undefined => {
  if (!source) return undefined;
  if (source instanceof Request) {
    return source.headers.get(REQUEST_ID_HEADER) ?? undefined;
  }
  if (!source.headers) return undefined;
  return getHeader(source.headers, REQUEST_ID_HEADER);
};

function getHeader(headers: HeadersInit, key: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) {
      if (k.toLowerCase() === key.toLowerCase()) {
        return v;
      }
    }
    return undefined;
  }
  return headers[key] ?? headers[key.toLowerCase()];
}

export const filterResponseHeaders = (upstream?: HeadersInit): Record<string, string> => {
  if (!upstream) return {};

  const filtered: Record<string, string> = {};
  for (const key of RESPONSE_HEADER_ALLOWLIST) {
    const value = getHeader(upstream, key);
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered;
};

export const buildRetryHeaders = (
  status: number,
  upstream: Record<string, string> = {},
): Record<string, string> => {
  const retryable = RETRYABLE_STATUS_CODES.has(status);

  if (!retryable) {
    upstream[X_SHOULD_RETRY_HEADER] = "false";
    return upstream;
  }

  const upstreamMs = upstream[RETRY_AFTER_MS_HEADER];
  const upstreamSec = upstream[RETRY_AFTER_HEADER];
  const upstreamSecNum = upstreamSec === undefined ? NaN : Number(upstreamSec);

  const retryAfterMs =
    upstreamMs ??
    (Number.isFinite(upstreamSecNum)
      ? String(upstreamSecNum * 1000)
      : String(DEFAULT_RETRY_AFTER_MS));

  const retryAfter = upstreamSec ?? String(Math.ceil(Number(retryAfterMs) / 1000));

  upstream[RETRY_AFTER_MS_HEADER] = retryAfterMs;
  upstream[RETRY_AFTER_HEADER] = retryAfter;
  upstream[X_SHOULD_RETRY_HEADER] ??= "true";

  return upstream;
};
