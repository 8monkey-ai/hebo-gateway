export const REQUEST_ID_HEADER = "x-request-id";

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
