import { resolveRequestId } from "../utils/headers";
import { initFetch } from "./fetch";

type PerfStore = {
  timers: Record<string, number>;
  origin: number;
  memory?: {
    steadyHeapUsed: number;
    peakHeapUsed: number;
  };
};
type RequestIdSource = string | URL | Request | RequestInit;

const REQ_PERF_KEY = Symbol.for("@hebo/perf/by-request");

type GlobalPerfState = typeof globalThis & {
  [REQ_PERF_KEY]?: Map<string, PerfStore>;
};
const g = globalThis as GlobalPerfState;
const perfByRequestId = (g[REQ_PERF_KEY] ??= new Map<string, PerfStore>());

const toMb = (bytes: number) => +(bytes / (1024 * 1024)).toFixed(2);
const mem = () => process?.memoryUsage?.();

const samplePeakMemory = (perf: PerfStore) => {
  const heapUsed = mem()?.heapUsed;
  if (perf.memory && heapUsed && heapUsed > perf.memory.peakHeapUsed)
    perf.memory.peakHeapUsed = heapUsed;
};

const getPerfStore = (source: RequestIdSource) => {
  const id = resolveRequestId(source);
  return id ? perfByRequestId.get(id) : undefined;
};

export const initPerf = (source: RequestIdSource) => {
  initFetch();

  const id = resolveRequestId(source);
  if (!id || perfByRequestId.has(id)) return;

  const heapUsed = mem()?.heapUsed;

  perfByRequestId.set(id, {
    timers: {},
    origin: performance.now(),
    memory: heapUsed == null ? undefined : { steadyHeapUsed: heapUsed, peakHeapUsed: heapUsed },
  });
};

const mark = (source: RequestIdSource, name: string, once: boolean) => {
  const perf = getPerfStore(source);
  if (!perf) return;

  const existing = perf.timers[name];
  if (once && existing !== undefined) return existing;

  const value = +(performance.now() - perf.origin).toFixed(2);
  perf.timers[name] = value;

  samplePeakMemory(perf);

  return value;
};

export const markPerf = (source: RequestIdSource, name: string) => mark(source, name, false);

export const markPerfOnce = (source: RequestIdSource, name: string) => mark(source, name, true);

export const clearPerf = (source: RequestIdSource) => {
  const id = resolveRequestId(source);
  if (id) perfByRequestId.delete(id);
};

export const getPerfMeta = (source: RequestIdSource) => getPerfStore(source)?.timers ?? {};

export const getMemoryMeta = (source: RequestIdSource) => {
  const perf = getPerfStore(source);
  if (!perf?.memory) return;

  samplePeakMemory(perf);
  const memory = mem();

  return {
    total: memory ? toMb(memory.rss) : undefined,
    request: toMb(perf.memory.peakHeapUsed - perf.memory.steadyHeapUsed),
  };
};
