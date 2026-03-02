import type { Attributes } from "@opentelemetry/api";

import type { Embeddings, EmbeddingsInputs } from "./schema";

import { type TelemetrySignalLevel } from "../../types";

export const getEmbeddingsRequestAttributes = (
  inputs: EmbeddingsInputs,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

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
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.usage.input_tokens": embeddings.usage?.prompt_tokens,
      "gen_ai.usage.total_tokens": embeddings.usage?.total_tokens,
    });
  }

  return attrs;
};
