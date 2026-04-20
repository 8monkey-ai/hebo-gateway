import { type TogetherAIProvider } from "@ai-sdk/togetherai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
  "minimax/m2.7": "MiniMax/MiniMax-M2.7",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForTogetherAI = (
  provider: TogetherAIProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
