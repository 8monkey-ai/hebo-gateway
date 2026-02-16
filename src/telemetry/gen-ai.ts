import { metrics, type Attributes } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

const meter = metrics.getMeter("@hebo-ai/gateway");

const requestDurationHistogram = meter.createHistogram("gen_ai.server.request.duration", {
  description: "End-to-end gateway request duration",
  unit: "s",
  advice: {
    explicitBucketBoundaries: [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 240,
    ],
  },
});

const tokenUsageCounter = meter.createCounter("gen_ai.client.token.usage", {
  description: "Token usage reported by upstream model responses",
  unit: "{token}",
  advice: {
    explicitBucketBoundaries: [
      1, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144,
      524288, 1048576,
    ],
  },
});

// FUTURE: record unsuccessful calls
export const recordRequestDuration = (
  duration: number,
  attrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || signalLevel === "off") return;

  requestDurationHistogram.record(duration / 1000, attrs);
};

// FUTURE: record unsuccessful calls
export const recordTokenUsage = (attrs: Attributes, signalLevel?: TelemetrySignalLevel) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;

  const add = (value: unknown, tokenType: string) => {
    tokenUsageCounter.add(
      value as number,
      Object.assign({}, attrs, { "gen_ai.token.type": tokenType }),
    );
  };

  add(attrs["gen_ai.usage.input_tokens"], "input");
  add(attrs["gen_ai.usage.output_tokens"], "output");
  add(attrs["gen_ai.usage.total_tokens"], "total");
  add(attrs["gen_ai.usage.cached_tokens"], "cached");
  add(attrs["gen_ai.usage.reasoning_tokens"], "reasoning");
};
