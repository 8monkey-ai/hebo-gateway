import { type OpenAIProvider } from "@ai-sdk/openai";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForOpenAI = (
  provider: OpenAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "openai",
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
