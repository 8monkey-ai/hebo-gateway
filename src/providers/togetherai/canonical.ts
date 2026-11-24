import { type TogetherAIProvider } from "@ai-sdk/togetherai";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForTogetherAI = (
  provider: TogetherAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "togetherai",
    mapping: extraMapping,
    options: { stripNamespace: false },
  });
