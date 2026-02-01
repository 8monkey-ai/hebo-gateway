import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimension` (Cohere)
export const cohereEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let dimensions = unknown["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    (params.providerOptions!["cohere"] ??= {})["outputDimension"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: cohereEmbeddingModelMiddleware });
