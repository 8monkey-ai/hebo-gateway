export const REQUEST_ID_HEADER = "x-request-id";

type HeaderSource =
  | string
  | URL
  | Headers
  | Request
  | Response
  | RequestInit
  | ResponseInit
  | HeadersInit
  | undefined;

export const resolveRequestId = (source: HeaderSource): string | undefined => {
  if (!source || typeof source === "string" || source instanceof URL) return undefined;

  if (source instanceof Request || source instanceof Response) {
    return source.headers.get(REQUEST_ID_HEADER) ?? undefined;
  }

  const headers = "headers" in source ? source.headers : source;
  if (!headers || typeof headers === "string") return undefined;

  if (Object.getPrototypeOf(headers) === Object.prototype) {
    return (headers as Record<string, string>)[REQUEST_ID_HEADER] ?? undefined;
  }

  if (headers instanceof Headers) return headers.get(REQUEST_ID_HEADER) ?? undefined;

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === REQUEST_ID_HEADER) return value;
    }
    return undefined;
  }

  return undefined;
};
