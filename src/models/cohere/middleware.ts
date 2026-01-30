import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimension` (Cohere)
export const cohereEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    let dimensions = unhandled["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    (params.providerOptions!["cohere"] ??= {})["outputDimension"] = dimensions;
    delete unhandled["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: cohereEmbeddingModelMiddleware });
