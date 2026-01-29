import { createCamelCaseProviderOptionsEmbeddingMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("voyage.embedding", {
  embedding: createCamelCaseProviderOptionsEmbeddingMiddleware("voyage"),
});
