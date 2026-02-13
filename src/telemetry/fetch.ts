import { SpanKind } from "@opentelemetry/api";

import { withSpan } from "./span";

const ORIGINAL_FETCH_KEY = Symbol.for("@hebo/fetch/original-fetch");

type GlobalFetchState = typeof globalThis & {
  [ORIGINAL_FETCH_KEY]?: typeof fetch;
};

const g = globalThis as GlobalFetchState;

const perfFetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const original = g[ORIGINAL_FETCH_KEY]!;
  return withSpan("fetch", () => original(input, init), { kind: SpanKind.CLIENT });
};

export const initFetch = () => {
  if (g[ORIGINAL_FETCH_KEY]) return;

  g[ORIGINAL_FETCH_KEY] = globalThis.fetch.bind(globalThis);
  globalThis.fetch = perfFetch as typeof fetch;
};
