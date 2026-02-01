import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimensionality` (Google)
export const geminiEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let dimensions = unknown["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    (params.providerOptions!["google"] ??= {})["outputDimensionality"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/gemini-*embedding-*", {
  embedding: geminiEmbeddingModelMiddleware,
});
