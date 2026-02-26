import { SpanKind, type Attributes } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

import { setSpanAttributes, withSpan } from "./span";

const ORIGINAL_FETCH_KEY = Symbol.for("@hebo/fetch/original-fetch");

type GlobalFetchState = typeof globalThis & {
  [ORIGINAL_FETCH_KEY]?: typeof fetch;
};

const g = globalThis as GlobalFetchState;
let fetchTracingEnabled = false;

const isRequest = (value: unknown): value is Request =>
  typeof Request !== "undefined" && value instanceof Request;

const getRequestAttributes = (input: RequestInfo | URL, init?: RequestInit): Attributes => {
  const attrs: Attributes = {
    "http.request.method": init?.method ?? (isRequest(input) ? input.method : "GET"),
  };

  if (input instanceof URL) attrs["url.full"] = input.href;
  else if (typeof input === "string") attrs["url.full"] = input;
  else if (isRequest(input)) attrs["url.full"] = input.url;

  return attrs;
};

const shouldTraceFetch = (init?: RequestInit): boolean =>
  typeof (init?.headers as any)?.["user-agent"] === "string" &&
  (init!.headers as any)["user-agent"].indexOf("ai-sdk/provider-utils") !== -1;

const otelFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const original = g[ORIGINAL_FETCH_KEY]!;

  if (!fetchTracingEnabled) return original(input, init);
  if (!shouldTraceFetch(init)) return original(input, init);

  return withSpan(
    "fetch",
    async () => {
      const response = await original(input, init);
      setSpanAttributes({ "http.response.status_code": response.status });
      return response;
    },
    {
      kind: SpanKind.CLIENT,
      attributes: getRequestAttributes(input, init),
    },
  );
};

export const initFetch = (level?: TelemetrySignalLevel) => {
  fetchTracingEnabled = level === "full";
  if (!fetchTracingEnabled) return;
  if (g[ORIGINAL_FETCH_KEY]) return;

  g[ORIGINAL_FETCH_KEY] = globalThis.fetch.bind(globalThis);
  globalThis.fetch = otelFetch as typeof fetch;
};
