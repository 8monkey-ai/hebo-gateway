import { createNormalizedProviderOptionsEmbeddingMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("openai.*", {
  embedding: createNormalizedProviderOptionsEmbeddingMiddleware("openai"),
});
