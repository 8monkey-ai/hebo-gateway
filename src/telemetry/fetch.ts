import { SpanKind } from "@opentelemetry/api";

import { startSpan } from "./span";

const ORIGINAL_FETCH_KEY = Symbol.for("@hebo/fetch/original-fetch");

type GlobalFetchState = typeof globalThis & {
  [ORIGINAL_FETCH_KEY]?: typeof fetch;
};

const g = globalThis as GlobalFetchState;

const perfFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const original = g[ORIGINAL_FETCH_KEY]!;
  const span = startSpan("fetch", { kind: SpanKind.CLIENT });
  try {
    return await span.runWithContext(() => original(input, init));
  } catch (error) {
    span.recordError(error);
    throw error;
  } finally {
    span.finish();
  }
};

export const initFetch = () => {
  if (g[ORIGINAL_FETCH_KEY]) return;

  g[ORIGINAL_FETCH_KEY] = globalThis.fetch.bind(globalThis);
  globalThis.fetch = perfFetch as typeof fetch;
};
