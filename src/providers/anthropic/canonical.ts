import { type AnthropicProvider } from "@ai-sdk/anthropic";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForAnthropic = (
  provider: AnthropicProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
