import { createCamelCaseProviderOptionsEmbeddingMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Future: Not for cohere models
modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  embedding: createCamelCaseProviderOptionsEmbeddingMiddleware("bedrock"),
});
