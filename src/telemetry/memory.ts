import { metrics } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

const getMeter = () => metrics.getMeter("@hebo/gateway");
const defaultHeapSpaceAttrs = { "v8js.heap.space.name": "total" } as const;

let registered = false;

const isEnabled = (level?: TelemetrySignalLevel) => level === "recommended" || level === "full";

const observeMemory = (observe: (heapUsed: number, rss: number) => void) => {
  let usage;
  try {
    usage = globalThis.process?.memoryUsage?.();
  } catch {
    return;
  }
  if (!usage) return;

  observe(usage.heapUsed, usage.rss);
};

export const observeV8jsMemoryMetrics = (level?: TelemetrySignalLevel) => {
  if (!isEnabled(level) || registered) return;
  registered = true;

  const meter = getMeter();

  meter
    .createObservableGauge("v8js.memory.heap.used", {
      description: "Used bytes in the V8 heap",
      unit: "By",
    })
    .addCallback((result) => {
      observeMemory((heapUsed) => {
        result.observe(heapUsed, defaultHeapSpaceAttrs);
      });
    });

  meter
    .createObservableGauge("v8js.memory.heap.space.physical_size", {
      description: "Physical bytes allocated for the V8 heap space",
      unit: "By",
    })
    .addCallback((result) => {
      observeMemory((_, rss) => {
        result.observe(rss, defaultHeapSpaceAttrs);
      });
    });
};
