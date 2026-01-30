import { createNormalizedProviderOptionsEmbeddingMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("google.vertex.*", {
  embedding: createNormalizedProviderOptionsEmbeddingMiddleware("google"),
});
