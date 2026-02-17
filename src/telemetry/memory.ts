import { metrics } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

const meter = metrics.getMeter("@hebo/gateway");
const defaultHeapSpaceAttrs = { "v8js.heap.space.name": "total" } as const;

const heapUsedCounter = meter.createUpDownCounter("v8js.memory.heap.used", {
  description: "Used bytes in the V8 heap",
  unit: "By",
});

const heapSpacePhysicalSizeCounter = meter.createUpDownCounter(
  "v8js.memory.heap.space.physical_size",
  {
    description: "Physical bytes allocated for the V8 heap space",
    unit: "By",
  },
);

const isEnabled = (level?: TelemetrySignalLevel) => level === "recommended" || level === "full";

export const recordV8jsMemory = (level?: TelemetrySignalLevel) => {
  if (!isEnabled(level)) return;

  let usage;
  try {
    usage = globalThis.process?.memoryUsage?.();
  } catch {
    return;
  }
  if (!usage) return;

  heapUsedCounter.add(usage.heapUsed, defaultHeapSpaceAttrs);
  heapSpacePhysicalSizeCounter.add(usage.rss, defaultHeapSpaceAttrs);
};
