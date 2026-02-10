import { markPerf, markPerfOnce } from "./perf";

const ORIGINAL_FETCH_KEY = Symbol.for("@hebo/fetch/original-fetch");

type GlobalFetchState = typeof globalThis & {
  [ORIGINAL_FETCH_KEY]?: typeof fetch;
};

const g = globalThis as GlobalFetchState;

const perfFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const original = g[ORIGINAL_FETCH_KEY]!;
  markPerfOnce(init ?? input, "fetchStart");
  const response = await original(input, init);
  markPerf(init ?? input, "fetchEnd");
  return response;
};

export const initFetch = () => {
  if (g[ORIGINAL_FETCH_KEY]) return;

  g[ORIGINAL_FETCH_KEY] = globalThis.fetch.bind(globalThis);
  globalThis.fetch = perfFetch as typeof fetch;
};
