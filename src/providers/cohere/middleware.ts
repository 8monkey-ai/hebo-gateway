import type { CanonicalProviderId } from "../types";

import { createCamelCaseProviderOptionsEmbeddingMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("cohere.textEmbedding", {
  embedding: createCamelCaseProviderOptionsEmbeddingMiddleware(
    "cohere" satisfies CanonicalProviderId,
  ),
});
