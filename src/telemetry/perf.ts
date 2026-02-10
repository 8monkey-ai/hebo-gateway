import { resolveRequestId } from "../utils/headers";
import { initFetch } from "./fetch";

type PerfStore = {
  timers: Record<string, number>;
  origin: number;
};
type RequestIdSource = string | URL | Request | RequestInit;

const REQ_PERF_KEY = Symbol.for("@hebo/perf/by-request");

type GlobalPerfState = typeof globalThis & {
  [REQ_PERF_KEY]?: Map<string, PerfStore>;
};
const g = globalThis as GlobalPerfState;
const perfByRequestId = (g[REQ_PERF_KEY] ??= new Map<string, PerfStore>());

const getPerfStore = (source: RequestIdSource): PerfStore | undefined => {
  const requestId = resolveRequestId(source);
  if (!requestId) return undefined;
  return perfByRequestId.get(requestId);
};

export const initPerf = (source: RequestIdSource) => {
  initFetch();
  const requestId = resolveRequestId(source);
  if (!requestId) return;
  if (perfByRequestId.has(requestId)) return;
  perfByRequestId.set(requestId, {
    timers: {},
    origin: performance.now(),
  });
};

const mark = (source: RequestIdSource, name: string, once: boolean) => {
  const perf = getPerfStore(source);
  if (!perf) return;
  const existing = perf.timers[name];
  if (once && existing !== undefined) return existing;

  const value = +(performance.now() - perf.origin).toFixed(2);
  perf.timers[name] = value;
  return value;
};

export const markPerf = (source: RequestIdSource, name: string) => {
  return mark(source, name, false);
};

export const markPerfOnce = (source: RequestIdSource, name: string) => {
  return mark(source, name, true);
};

export const clearPerf = (source: RequestIdSource) => {
  const requestId = resolveRequestId(source);
  if (!requestId) return;
  perfByRequestId.delete(requestId);
};

export const getPerfMeta = (source: RequestIdSource) => {
  const perf = getPerfStore(source);
  return perf?.timers ?? {};
};
