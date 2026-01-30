import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimension` (Voyage)
export const voyageEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    let dimensions = unhandled["dimensions"];
    if (!dimensions) dimensions = 1024;

    if (![256, 512, 1024, 1536, 2048].includes(dimensions as number)) {
      throw new Error(
        "Voyage embeddings only support dimensions of 256, 512, 1024, 1536, or 2048.",
      );
    }

    (params.providerOptions!["voyage"] ??= {})["outputDimension"] = dimensions;
    delete unhandled["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("voyage/*", { embedding: voyageEmbeddingModelMiddleware });
