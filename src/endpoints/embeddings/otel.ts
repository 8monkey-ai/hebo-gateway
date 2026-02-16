import type { Attributes } from "@opentelemetry/api";

import type { Embeddings, EmbeddingsInputs } from "./schema";

const DEFAULT_ATTRIBUTES_LEVEL = "recommended";

export const getEmbeddingsRequestAttributes = (
  inputs: EmbeddingsInputs,
  attributesLevel: string = DEFAULT_ATTRIBUTES_LEVEL,
): Attributes => {
  const attrs: Attributes = {};

  if (attributesLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.embeddings.dimension.count": inputs.dimensions,
    });
  }

  return attrs;
};

export const getEmbeddingsResponseAttributes = (
  embeddings: Embeddings,
  attributesLevel: string = DEFAULT_ATTRIBUTES_LEVEL,
): Attributes => {
  const attrs: Attributes = {};

  if (attributesLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.usage.input_tokens": embeddings.usage?.prompt_tokens,
      "gen_ai.usage.total_tokens": embeddings.usage?.total_tokens,
    });
  }

  return attrs;
};
