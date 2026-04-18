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

  const headers = source.headers;
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    return headers.get(REQUEST_ID_HEADER) ?? undefined;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === REQUEST_ID_HEADER) return value;
    }
    return undefined;
  }

  return headers[REQUEST_ID_HEADER];
};

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
  const headers = filterResponseHeaders(upstream) ?? {};

  const shouldRetryHeader = headers[X_SHOULD_RETRY_HEADER];
  const hasRetryAfter = headers[RETRY_AFTER_HEADER] !== undefined;
  const hasRetryAfterMs = headers[RETRY_AFTER_MS_HEADER] !== undefined;

  if (!RETRYABLE_STATUS_CODES.has(status)) {
    if (shouldRetryHeader === undefined) {
      headers[X_SHOULD_RETRY_HEADER] = "false";
    }
    if (hasRetryAfterMs && !hasRetryAfter) {
      headers[RETRY_AFTER_HEADER] = String(
        Math.ceil(Number(headers[RETRY_AFTER_MS_HEADER]) / 1000),
      );
    }
    if (hasRetryAfter && !hasRetryAfterMs) {
      headers[RETRY_AFTER_MS_HEADER] = String(Number(headers[RETRY_AFTER_HEADER]) * 1000);
    }
    return headers;
  }

  if (!hasRetryAfter && !hasRetryAfterMs) {
    headers[RETRY_AFTER_MS_HEADER] = String(DEFAULT_RETRY_AFTER_MS);
    headers[RETRY_AFTER_HEADER] = String(Math.ceil(DEFAULT_RETRY_AFTER_MS / 1000));
  } else if (hasRetryAfterMs && !hasRetryAfter) {
    headers[RETRY_AFTER_HEADER] = String(Math.ceil(Number(headers[RETRY_AFTER_MS_HEADER]) / 1000));
  } else if (hasRetryAfter && !hasRetryAfterMs) {
    headers[RETRY_AFTER_MS_HEADER] = String(Number(headers[RETRY_AFTER_HEADER]) * 1000);
  }

  if (shouldRetryHeader === undefined) {
    headers[X_SHOULD_RETRY_HEADER] = "true";
  }
  return headers;
};
