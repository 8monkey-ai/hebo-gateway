import type { ProviderV3 } from "@ai-sdk/provider";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "meta/llama-4-maverick": "meta/llama-4-maverick-17b-128e-instruct",
  "google/gemma-3-27b": "google/gemma-3-27b-it",
  "google/gemma-4-e2b": "google/gemma-3n-e2b-it",
  "google/gemma-4-e4b": "google/gemma-3n-e4b-it",
  "deepseek/deepseek-v3.2": "deepseek-ai/deepseek-v3.2",
  "minimax/m2.7": "minimaxai/minimax-m2.7",
  "nvidia/mistral-nemotron": "mistralai/mistral-nemotron",
  "nvidia/mistral-large-3-675b": "mistralai/mistral-large-3-675b-instruct-2512",
  "nvidia/devstral-2-123b": "mistralai/devstral-2-123b-instruct-2512",
  "nvidia/qwen3-coder-480b": "qwen/qwen3-coder-480b-a35b-instruct",
  "nvidia/deepseek-v3.1-terminus": "deepseek-ai/deepseek-v3.1-terminus",
  "nvidia/kimi-k2": "moonshotai/kimi-k2-instruct",
  "nvidia/glm-4.7": "z-ai/glm-4.7",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForNvidia = (
  provider: ProviderV3,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
