import { createNormalizedProviderOptionsEmbeddingMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Future: Not for cohere models
modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  embedding: createNormalizedProviderOptionsEmbeddingMiddleware("bedrock"),
});
