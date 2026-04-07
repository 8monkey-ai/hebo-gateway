import { metrics, type Attributes, type Histogram } from "@opentelemetry/api";

import { STATUS_CODE } from "../errors/utils";
import type { GatewayContext, TelemetrySignalLevel } from "../types";

const getMeter = () => metrics.getMeter("@hebo/gateway");

let requestDurationHistogram: Histogram | undefined;
let timePerOutputTokenHistogram: Histogram | undefined;
let timeToFirstTokenHistogram: Histogram | undefined;
let tokenUsageHistogram: Histogram | undefined;

const getRequestDurationHistogram = () =>
  (requestDurationHistogram ??= getMeter().createHistogram("gen_ai.server.request.duration", {
    description: "End-to-end gateway request duration",
    unit: "s",
    advice: {
      explicitBucketBoundaries: [
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 240,
      ],
    },
  }));

const getTimePerOutputTokenHistogram = () =>
  (timePerOutputTokenHistogram ??= getMeter().createHistogram(
    "gen_ai.server.time_per_output_token",
    {
      description: "End-to-end gateway request duration per output token",
      unit: "s",
      advice: {
        explicitBucketBoundaries: [
          0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 2.5,
        ],
      },
    },
  ));

const getTimeToFirstTokenHistogram = () =>
  (timeToFirstTokenHistogram ??= getMeter().createHistogram(
    "gen_ai.server.time_to_first_token",
    {
      description: "Duration from request start to first streamed token",
      unit: "s",
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5,
          10.0,
        ],
      },
    },
  ));

const getTokenUsageHistogram = () =>
  (tokenUsageHistogram ??= getMeter().createHistogram("gen_ai.client.token.usage", {
    description: "Token usage reported by upstream model responses",
    unit: "{token}",
    advice: {
      explicitBucketBoundaries: [
        1, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072,
        262144, 524288, 1048576,
      ],
    },
  }));

export const getGenAiGeneralAttributes = (
  ctx: GatewayContext,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const requestModel = typeof ctx.body?.model === "string" ? ctx.body.model : ctx.modelId;

  const attrs: Attributes = {
    "gen_ai.operation.name": ctx.operation,
    "gen_ai.request.model": requestModel,
    "gen_ai.response.model": ctx.resolvedModelId,
    "gen_ai.provider.name": ctx.resolvedProviderId,
  };

  for (const key in ctx.otel) {
    attrs[key] = ctx.otel[key];
  }

  return attrs;
};

export const recordRequestDuration = (
  duration: number,
  status: number,
  ctx: GatewayContext,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || signalLevel === "off") return;

  const attrs = getGenAiGeneralAttributes(ctx, signalLevel);

  if (status !== 200) {
    attrs["error.type"] = `${status} ${STATUS_CODE(status).toLowerCase()}`;
  }

  getRequestDurationHistogram().record(duration / 1000, attrs);
};

export const recordTimeToFirstToken = (
  duration: number,
  metricAttrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;
  getTimeToFirstTokenHistogram().record(duration / 1000, metricAttrs);
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

  getTimePerOutputTokenHistogram().record(
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
    getTokenUsageHistogram().record(
      value,
      Object.assign({}, metricAttrs, { "gen_ai.token.type": tokenType }),
    );
  };

  record(tokenAttrs["gen_ai.usage.input_tokens"], "input");
  record(tokenAttrs["gen_ai.usage.output_tokens"], "output");
  record(tokenAttrs["gen_ai.usage.cache_read.input_tokens"], "cached");
  record(tokenAttrs["gen_ai.usage.reasoning.output_tokens"], "reasoning");
};
