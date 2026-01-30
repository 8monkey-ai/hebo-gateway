import { createNormalizedProviderOptionsEmbeddingMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("cohere.textEmbedding", {
  embedding: createNormalizedProviderOptionsEmbeddingMiddleware("cohere"),
});
