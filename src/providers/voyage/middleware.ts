import { createNormalizedProviderOptionsEmbeddingMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("voyage.embedding", {
  embedding: createNormalizedProviderOptionsEmbeddingMiddleware("voyage"),
});
