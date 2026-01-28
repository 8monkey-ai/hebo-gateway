import { type OpenAIProvider } from "@ai-sdk/openai";

import type { ModelId } from "../../models/types";

import { withCanonicalIds } from "../registry";

export const withCanonicalIdsForOpenAI = (
  provider: OpenAIProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, extraMapping, {
    stripNamespace: true,
  });
