import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `embeddingDimension` (Nova)
export const novaEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    let dimensions = unhandled["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    if (![256, 384, 1024, 3072].includes(dimensions)) {
      throw new Error("Nova embeddings only support dimensions of 256, 384, 1024, or 3072.");
    }

    (params.providerOptions!["nova"] ??= {})["embeddingDimension"] = dimensions;
    delete unhandled["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("amazon/nova-*embeddings*", {
  embedding: novaEmbeddingModelMiddleware,
});
