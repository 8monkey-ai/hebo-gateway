import { createCamelCaseProviderOptionsEmbeddingMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("openai.*", {
  embedding: createCamelCaseProviderOptionsEmbeddingMiddleware("openai"),
});
