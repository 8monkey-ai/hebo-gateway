import type { CanonicalProviderId } from "../types";

import { createCamelCaseProviderOptionsMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("cohere.textEmbedding", {
  embedding: createCamelCaseProviderOptionsMiddleware("cohere" satisfies CanonicalProviderId),
});
