import { type TelemetrySignalLevel } from "../types";
import { resolveRequestId } from "../utils/headers";

const headerArr = (h: Headers, k: string) => (h.has(k) ? [h.get(k)!] : undefined);

export const getRequestAttributes = (request: Request, signalLevel?: TelemetrySignalLevel) => {
  if (!signalLevel || signalLevel === "off") return {};

  let url;
  try {
    // FUTURE: reuse URL from lifecycle
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

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      // FUTURE: does ElysiaJS and other frameworks attach request id?
      "http.request.id": resolveRequestId(request),
      "user_agent.original": request.headers.get("user-agent") ?? undefined,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      // FUTURE: "url.query"
      "http.request.header.content-type": headerArr(request.headers, "content-type"),
      "http.request.header.content-length": headerArr(request.headers, "content-length"),
      // FUTURE: "client.address"
    });
  }

  return attrs;
};

export const getResponseAttributes = (response: Response, signalLevel?: TelemetrySignalLevel) => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs = {
    "http.response.status_code": response.status,
  };

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "http.response.header.content-type": [response.headers.get("content-type") ?? undefined],
      "http.response.header.content-length": [response.headers.get("content-length") ?? undefined],
    });
  }

  return attrs;
};
