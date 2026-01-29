import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../model-middleware";

// Pass `outputDimension` into 'voyage' provider
export const voyageEmbeddingProviderMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    const { outputDimension, ...rest } = unhandled;
    if (outputDimension === null || outputDimension === undefined) return params;

    return {
      ...params,
      providerOptions: {
        ...params.providerOptions,
        unhandled: rest,
        voyage: {
          outputDimension,
        },
      },
    };
  },
};

modelMiddlewareMatcher.useForProvider("voyage.embedding", {
  embedding: voyageEmbeddingProviderMiddleware,
});
