import { type TogetherAIProvider } from "@ai-sdk/togetherai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "deepseek/deepseek-v4.1-flash": "deepseek-ai/DeepSeek-V4.1-Flash",
  "google/gemma-4-31b": "google/gemma-4-31B-it",
  "meta/llama-3.1-8b": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  "meta/llama-3.1-70b": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  "meta/llama-3.1-405b": "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
  "meta/llama-3.2-3b": "meta-llama/Llama-3.2-3B-Instruct-Turbo",
  "meta/llama-3.3-70b": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "meta/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
  "minimax/m2.7": "MiniMax/MiniMax-M2.7",
  "alibaba/qwen3.5-397b": "Qwen/Qwen3.5-397B-A17B",
  "alibaba/qwen3.5-9b": "Qwen/Qwen3.5-9B",
  "alibaba/qwen3.8-2.4t": "Qwen/Qwen3.8-2.4T-A95B",
  "moonshot/kimi-k2.5": "moonshotai/Kimi-K2.5",
  "moonshot/kimi-k3": "moonshotai/Kimi-K3",
  "zhipu/glm-5": "zai-org/GLM-5",
  "zhipu/glm-5.1": "zai-org/GLM-5.1",
  "zhipu/glm-5.3": "zai-org/GLM-5.3",
  "zhipu/glm-5.3-flash": "zai-org/GLM-5.3-Flash",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForTogetherAI = (
  provider: TogetherAIProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
