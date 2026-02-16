import type { Attributes } from "@opentelemetry/api";

import type { Embeddings, EmbeddingsInputs } from "./schema";

import { type GatewayContext, type TelemetrySignalLevel } from "../../types";

export const getEmbeddingsGeneralAttributes = (ctx: GatewayContext): Attributes => {
  const requestModel =
    ctx.body && "model" in ctx.body && typeof ctx.body.model === "string"
      ? ctx.body.model
      : ctx.modelId;

  return {
    "gen_ai.operation.name": ctx.operation,
    "gen_ai.request.model": requestModel,
    "gen_ai.response.model": ctx.resolvedModelId,
    "gen_ai.provider.name": ctx.resolvedProviderId,
  };
};

export const getEmbeddingsRequestAttributes = (
  inputs: EmbeddingsInputs,
  signalLevel: TelemetrySignalLevel,
): Attributes => {
  if (signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.embeddings.dimension.count": inputs.dimensions,
    });
  }

  return attrs;
};

export const getEmbeddingsResponseAttributes = (
  embeddings: Embeddings,
  signalLevel: TelemetrySignalLevel,
): Attributes => {
  if (signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.usage.input_tokens": embeddings.usage?.prompt_tokens,
      "gen_ai.usage.total_tokens": embeddings.usage?.total_tokens,
    });
  }

  return attrs;
};
