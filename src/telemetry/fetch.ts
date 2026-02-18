import { SpanKind } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

import { withSpan } from "./span";

const ORIGINAL_FETCH_KEY = Symbol.for("@hebo/fetch/original-fetch");

type GlobalFetchState = typeof globalThis & {
  [ORIGINAL_FETCH_KEY]?: typeof fetch;
};

const g = globalThis as GlobalFetchState;
let fetchTracingEnabled = false;

const shouldTraceFetch = (init?: RequestInit): boolean =>
  typeof (init?.headers as any)?.["user-agent"] === "string" &&
  (init!.headers as any)["user-agent"].indexOf("ai-sdk/provider-utils") !== -1;

const otelFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const original = g[ORIGINAL_FETCH_KEY]!;

  if (!fetchTracingEnabled) return original(input, init);
  if (!shouldTraceFetch(init)) return original(input, init);
  return withSpan("fetch", () => original(input, init), { kind: SpanKind.CLIENT });
};

export const initFetch = (level?: TelemetrySignalLevel) => {
  fetchTracingEnabled = level === "full";
  if (!fetchTracingEnabled) return;
  if (g[ORIGINAL_FETCH_KEY]) return;

  g[ORIGINAL_FETCH_KEY] = globalThis.fetch.bind(globalThis);
  globalThis.fetch = otelFetch as typeof fetch;
};
