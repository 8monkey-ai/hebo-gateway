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

export const resolveRequestId = (request: Request): string | undefined =>
  request.headers.get(REQUEST_ID_HEADER) ?? undefined;

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
  const headers = upstream ?? {};
  const retryable = RETRYABLE_STATUS_CODES.has(status);

  const upstreamMs = headers[RETRY_AFTER_MS_HEADER];
  const upstreamSec = headers[RETRY_AFTER_HEADER];

  const retryAfterMs =
    upstreamMs ??
    (upstreamSec
      ? String(Number(upstreamSec) * 1000)
      : retryable
        ? String(DEFAULT_RETRY_AFTER_MS)
        : undefined);

  const retryAfter =
    upstreamSec ?? (retryAfterMs ? String(Math.ceil(Number(retryAfterMs) / 1000)) : undefined);

  if (retryAfterMs) headers[RETRY_AFTER_MS_HEADER] = retryAfterMs;
  if (retryAfter) headers[RETRY_AFTER_HEADER] = retryAfter;

  headers[X_SHOULD_RETRY_HEADER] ??= retryable ? "true" : "false";

  return headers;
};
