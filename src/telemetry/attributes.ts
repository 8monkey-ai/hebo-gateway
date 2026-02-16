import { resolveRequestId } from "../utils/headers";

type AttributesLevel = "required" | "recommended" | "full";
const DEFAULT_ATTRIBUTES_LEVEL: AttributesLevel = "recommended";
const HEBO_BAGGAGE_PREFIX = "hebo.";

export const getRequestAttributes = (
  request?: Request,
  attributesLevel: AttributesLevel = DEFAULT_ATTRIBUTES_LEVEL,
) => {
  if (!request) return {};

  let url;
  try {
    // FUTURE: use URL from lifecycle
    url = new URL(request.url);
  } catch {}

  const attrs = {
    "http.request.method": request.method,
    "url.full": request.url,
    "url.path": url?.pathname,
    "url.scheme": url?.protocol.replace(":", ""),
    "server.address": url?.hostname,
    "server.port": url
      ? url.port
        ? Number(url.port)
        : url.protocol === "https:"
          ? 443
          : 80
      : undefined,
  };

  if (attributesLevel !== "required") {
    Object.assign(attrs, {
      "http.request.id": resolveRequestId(request),
      "user_agent.original": request.headers.get("user-agent") ?? undefined,
    });
  }

  if (attributesLevel === "full") {
    Object.assign(attrs, {
      // FUTURE: "url.query"
      "http.request.header.content-type": [request.headers.get("content-type") ?? undefined],
      "http.request.header.content-length": [request.headers.get("content-length") ?? undefined],
      // FUTURE: "client.address"
    });
  }

  return attrs;
};

export const getResponseAttributes = (
  response?: Response,
  attributesLevel: AttributesLevel = DEFAULT_ATTRIBUTES_LEVEL,
) => {
  if (!response) return {};

  const attrs = {
    "http.response.status_code": response.status,
  };

  if (attributesLevel === "full") {
    Object.assign(attrs, {
      "http.response.header.content-type": [response.headers.get("content-type") ?? undefined],
      "http.response.header.content-length": [response.headers.get("content-length") ?? undefined],
    });
  }

  return attrs;
};

export const getBaggageAttributes = (request?: Request) => {
  const h = request?.headers.get("baggage");
  if (!h) return {};

  const attrs: Record<string, string> = {};

  for (const part of h.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (!k || !v) continue;

    const [rawValue] = v.split(";", 1);
    if (!rawValue) continue;

    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {}

    if (k.startsWith(HEBO_BAGGAGE_PREFIX)) {
      attrs[k.slice(HEBO_BAGGAGE_PREFIX.length)] = value;
    }
  }

  return attrs;
};
