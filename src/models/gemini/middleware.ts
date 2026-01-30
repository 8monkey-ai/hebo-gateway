import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimensionality` (Google)
export const geminiEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    const dimensions = unhandled["dimensions"];
    if (!dimensions) return params;

    if ((dimensions as number) > 3072) {
      throw new Error("Google embeddings only support dimensions up to 3072.");
    }

    (params.providerOptions!["google"] ??= {})["outputDimensionality"] = dimensions;
    delete unhandled["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/*embedding*", {
  embedding: geminiEmbeddingModelMiddleware,
});
