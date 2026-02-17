import { metrics, type Attributes } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

const meter = metrics.getMeter("@hebo/gateway");

const requestDurationHistogram = meter.createHistogram("gen_ai.server.request.duration", {
  description: "End-to-end gateway request duration",
  unit: "s",
  advice: {
    explicitBucketBoundaries: [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 240,
    ],
  },
});

const timePerOutputTokenHistogram = meter.createHistogram("gen_ai.server.time_per_output_token", {
  description: "End-to-end gateway request duration per output token",
  unit: "s",
  advice: {
    explicitBucketBoundaries: [
      0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 2.5,
    ],
  },
});

const tokenUsageHistogram = meter.createHistogram("gen_ai.client.token.usage", {
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
  start: number,
  attrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || signalLevel === "off") return;

  requestDurationHistogram.record((performance.now() - start) / 1000, attrs);
};

// FUTURE: record unsuccessful calls
export const recordTimePerOutputToken = (
  start: number,
  tokenAttrs: Attributes,
  metricAttrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;

  const outputTokens = tokenAttrs["gen_ai.usage.output_tokens"];
  if (typeof outputTokens !== "number" || outputTokens <= 0) return;

  timePerOutputTokenHistogram.record(
    (performance.now() - start) / 1000 / outputTokens,
    metricAttrs,
  );
};

// FUTURE: record unsuccessful calls
export const recordTokenUsage = (
  tokenAttrs: Attributes,
  metricAttrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;

  const record = (value: unknown, tokenType: string) => {
    if (typeof value !== "number") return;
    tokenUsageHistogram.record(
      value,
      Object.assign({}, metricAttrs, { "gen_ai.token.type": tokenType }),
    );
  };

  record(tokenAttrs["gen_ai.usage.input_tokens"], "input");
  record(tokenAttrs["gen_ai.usage.output_tokens"], "output");
  record(tokenAttrs["gen_ai.usage.total_tokens"], "total");
  record(tokenAttrs["gen_ai.usage.cached_tokens"], "cached");
  record(tokenAttrs["gen_ai.usage.reasoning_tokens"], "reasoning");
};
