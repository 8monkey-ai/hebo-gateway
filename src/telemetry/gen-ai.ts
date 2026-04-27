import { metrics, type Attributes, type Counter, type Histogram } from "@opentelemetry/api";
import {
  InvalidResponseDataError,
  InvalidToolInputError,
  JSONParseError,
  MissingToolResultsError,
  NoObjectGeneratedError,
  NoSuchToolError,
  ToolCallRepairError,
  TypeValidationError,
} from "ai";

import { STATUS_TEXT } from "../errors/utils";
import type { GatewayContext, TelemetrySignalLevel } from "../types";

const getMeter = () => metrics.getMeter("@hebo/gateway");

let requestDurationHistogram: Histogram | undefined;
let timePerOutputTokenHistogram: Histogram | undefined;
let timeToFirstTokenHistogram: Histogram | undefined;
let tokenUsageHistogram: Histogram | undefined;
let toolCallCounter: Counter | undefined;
let structuredOutputCounter: Counter | undefined;

const getRequestDurationHistogram = () =>
  (requestDurationHistogram ??= getMeter().createHistogram("gen_ai.server.request.duration", {
    description: "End-to-end gateway request duration",
    unit: "s",
    advice: {
      // Upstream OTel for http.server.request.duration.
      // We preserve that sequence and extend the tail for slow service tiers up to 30min.
      explicitBucketBoundaries: [
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 900, 1800,
      ],
    },
  }));

const getTimeToFirstTokenHistogram = () =>
  (timeToFirstTokenHistogram ??= getMeter().createHistogram("gen_ai.server.time_to_first_token", {
    description: "Time from request start until the first token is generated",
    unit: "s",
    advice: {
      // Upstream OTel uses the same dense sub-second sequence through 10s.
      // We preserve that sequence and extend the tail slow service tiers up to 30 min.
      explicitBucketBoundaries: [
        0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5, 7.5, 10, 30,
        60, 120, 300, 600, 900, 1800,
      ],
    },
  }));

const getTimePerOutputTokenHistogram = () =>
  (timePerOutputTokenHistogram ??= getMeter().createHistogram(
    "gen_ai.server.time_per_output_token",
    {
      description: "Time per output token generated after the first token",
      unit: "s",
      advice: {
        // Upstream OTel uses the same low-latency shape
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5,
        ],
      },
    },
  ));

const getToolCallCounter = () =>
  (toolCallCounter ??= getMeter().createCounter("gen_ai.server.tool_call", {
    description:
      "Number of requests that exercised tool calling. error.type is set only on failure.",
    unit: "{invocation}",
  }));

const getStructuredOutputCounter = () =>
  (structuredOutputCounter ??= getMeter().createCounter("gen_ai.server.structured_output", {
    description:
      "Number of requests that exercised structured output. error.type is set only on failure.",
    unit: "{invocation}",
  }));

const getTokenUsageHistogram = () =>
  (tokenUsageHistogram ??= getMeter().createHistogram("gen_ai.client.token.usage", {
    description: "Number of tokens used in the operation, by token type",
    unit: "{token}",
    advice: {
      // Upstream OTel uses powers of 4 up to 67,108,864 tokens.
      // We keep the low-end anchors, add denser mid/high-range buckets
      explicitBucketBoundaries: [
        1, 4, 16, 64, 256, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288,
        1048576, 4194304, 16777216, 67108864,
      ],
    },
  }));

export const getGenAiGeneralAttributes = (
  ctx: GatewayContext,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const requestModel = typeof ctx.body?.model === "string" ? ctx.body.model : ctx.modelId;
  const serviceTier =
    typeof ctx.body?.service_tier === "string" ? ctx.body.service_tier : undefined;

  const attrs: Attributes = {
    "gen_ai.operation.name": ctx.operation,
    "gen_ai.request.model": requestModel,
    "gen_ai.response.model": ctx.resolvedModelId,
    "gen_ai.provider.name": ctx.resolvedProviderId,
  };

  if (signalLevel !== "required" && serviceTier !== undefined) {
    attrs["gen_ai.request.service_tier"] = serviceTier;
  }

  for (const [key, value] of Object.entries(ctx.otel)) {
    if (value !== undefined) attrs[key] = value;
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
    attrs["error.type"] = `${status} ${STATUS_TEXT(status).toLowerCase()}`;
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
  ttft: number,
  tokenAttrs: Attributes,
  metricAttrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;

  const outputTokens = tokenAttrs["gen_ai.usage.output_tokens"];
  if (typeof outputTokens !== "number" || outputTokens <= 1) return;

  getTimePerOutputTokenHistogram().record(
    (performance.now() - start - ttft) / 1000 / (outputTokens - 1),
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
  // FUTURE: "cached" and "reasoning" token types are not yet in the OTel standard — monitor:
  // https://github.com/open-telemetry/semantic-conventions/issues/1959
  // https://github.com/open-telemetry/semantic-conventions/issues/3341
  record(tokenAttrs["gen_ai.usage.cache_read.input_tokens"], "cached");
  record(tokenAttrs["gen_ai.usage.reasoning.output_tokens"], "reasoning");
};

export type FeatureErrorType =
  | "invalid_input"
  | "unknown_tool"
  | "repair_failed"
  | "missing_results"
  | "invalid_json"
  | "schema_mismatch"
  | "no_output"
  | "invalid_response";

type FeatureKind = "tool_call" | "structured_output";

const classifyAiSdkError = (
  error: unknown,
): { kind: FeatureKind; type: FeatureErrorType } | undefined => {
  if (InvalidToolInputError.isInstance(error)) return { kind: "tool_call", type: "invalid_input" };
  if (NoSuchToolError.isInstance(error)) return { kind: "tool_call", type: "unknown_tool" };
  if (ToolCallRepairError.isInstance(error)) return { kind: "tool_call", type: "repair_failed" };
  if (MissingToolResultsError.isInstance(error))
    return { kind: "tool_call", type: "missing_results" };
  if (NoObjectGeneratedError.isInstance(error))
    return { kind: "structured_output", type: "no_output" };
  if (TypeValidationError.isInstance(error))
    return { kind: "structured_output", type: "schema_mismatch" };
  if (JSONParseError.isInstance(error)) return { kind: "structured_output", type: "invalid_json" };
  if (InvalidResponseDataError.isInstance(error))
    return { kind: "structured_output", type: "invalid_response" };
  return undefined;
};

const getFeatureCounter = (kind: FeatureKind) =>
  kind === "tool_call" ? getToolCallCounter() : getStructuredOutputCounter();

export const recordToolCallOutcome = (
  metricAttrs: Attributes,
  errorType: FeatureErrorType | undefined,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;
  const attrs = errorType
    ? Object.assign({}, metricAttrs, { "error.type": errorType })
    : metricAttrs;
  getToolCallCounter().add(1, attrs);
};

export const recordStructuredOutputOutcome = (
  metricAttrs: Attributes,
  errorType: FeatureErrorType | undefined,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;
  const attrs = errorType
    ? Object.assign({}, metricAttrs, { "error.type": errorType })
    : metricAttrs;
  getStructuredOutputCounter().add(1, attrs);
};

/**
 * Classifies an error against known AI SDK error classes and emits a failure on
 * the corresponding feature counter. No-op for unrelated errors (those are
 * captured by `gen_ai.server.request.duration`).
 */
export const recordAiSdkFeatureError = (
  error: unknown,
  metricAttrs: Attributes,
  signalLevel?: TelemetrySignalLevel,
) => {
  if (!signalLevel || (signalLevel !== "recommended" && signalLevel !== "full")) return;
  const classified = classifyAiSdkError(error);
  if (!classified) return;
  getFeatureCounter(classified.kind).add(
    1,
    Object.assign({}, metricAttrs, { "error.type": classified.type }),
  );
};
