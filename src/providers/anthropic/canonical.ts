import { type AnthropicProvider } from "@ai-sdk/anthropic";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "anthropic/claude-fable-5": "claude-5-fable-20260609",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForAnthropic = (
  provider: AnthropicProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
      normalizeDelimiters: true,
    },
  });
