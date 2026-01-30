import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `dimensions` (OpenAI)
export const openAIEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    let dimensions = unhandled["dimensions"];
    if (!dimensions) dimensions = 1024;

    if ((dimensions as number) > 3072) {
      throw new Error("OpenAI embeddings only support dimensions up to 3072.");
    }

    (params.providerOptions!["openai"] ??= {})["dimensions"] = dimensions;
    delete unhandled["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("openai/text-embedding-*", {
  embedding: openAIEmbeddingModelMiddleware,
});
