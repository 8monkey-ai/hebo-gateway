import { type TogetherAIProvider } from "@ai-sdk/togetherai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "meta/llama-3.1-8b": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  "meta/llama-3.1-70b": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  "meta/llama-3.1-405b": "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
  "meta/llama-3.2-3b": "meta-llama/Llama-3.2-3B-Instruct-Turbo",
  "meta/llama-3.3-70b": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "meta/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
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
