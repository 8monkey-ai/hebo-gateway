import type { CanonicalProviderId } from "../types";

import { createCamelCaseProviderOptionsMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Future: Not for cohere models
modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  embedding: createCamelCaseProviderOptionsMiddleware("bedrock" satisfies CanonicalProviderId),
});
