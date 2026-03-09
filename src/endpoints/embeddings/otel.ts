import type { Attributes } from "@opentelemetry/api";

import type { Embeddings, EmbeddingsBody } from "./schema";

import { type TelemetrySignalLevel } from "../../types";

export const getEmbeddingsRequestAttributes = (
  body: EmbeddingsBody,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.embeddings.dimension.count": body.dimensions,
    });

    if (inputs.metadata) {
      for (const key in inputs.metadata) {
        attrs[`gen_ai.request.metadata.${key}`] = inputs.metadata[key];
      }
    }
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
