import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimension` (Cohere)
export const cohereEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    let dimensions = unhandled["dimensions"];
    if (!dimensions) dimensions = 1024;

    if (![256, 384, 512, 1024, 1536].includes(dimensions as number)) {
      throw new Error("Cohere embeddings only support dimensions of 256, 512, 1024, or 1536.");
    }

    (params.providerOptions!["cohere"] ??= {})["outputDimension"] = dimensions;
    delete unhandled["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: cohereEmbeddingModelMiddleware });
