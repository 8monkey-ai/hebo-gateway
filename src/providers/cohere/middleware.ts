import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../model-middleware";

// Pass `outputDimension` into 'cohere' provider
export const cohereEmbeddingProviderMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    const { output_dimension, ...rest } = unhandled;
    if (output_dimension === null || output_dimension === undefined) return params;

    return {
      ...params,
      providerOptions: {
        ...params.providerOptions,
        unhandled: rest,
        cohere: {
          outputDimension: output_dimension,
        },
      },
    };
  },
};

modelMiddlewareMatcher.useForProvider("cohere.textEmbedding", {
  embedding: cohereEmbeddingProviderMiddleware,
});
