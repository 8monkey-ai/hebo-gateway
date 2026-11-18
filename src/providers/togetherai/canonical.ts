import { type TogetherAIProvider } from "@ai-sdk/togetherai";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "deepseek/deepseek-v4.1-flash-1017": "deepseek-ai/DeepSeek-V4.1-Flash",
  "google/gemma-4-31b-it": "google/gemma-4-31B-it",
  "meta/llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  "minimax/MiniMax-M2.5": "MiniMax/MiniMax-M2.5",
  "minimax/MiniMax-M3": "MiniMaxAI/MiniMax-M3",
  "alibaba/qwen3.5-397b-a17b": "Qwen/Qwen3.5-397B-A17B",
  "alibaba/qwen3.5-9b": "Qwen/Qwen3.5-9B",
  "alibaba/qwen3.8-2.4t-a95b": "Qwen/Qwen3.8-2.4T-A95B",
  "moonshotai/kimi-k2.5": "moonshotai/Kimi-K2.5",
  "moonshotai/kimi-k3": "moonshotai/Kimi-K3",
  "zhipuai/glm-5": "zai-org/GLM-5",
  "zhipuai/glm-5.1": "zai-org/GLM-5.1",
  "zhipuai/glm-5.2": "zai-org/GLM-5.2",
  "zhipuai/glm-5.3": "zai-org/GLM-5.3",
  "zhipuai/glm-5.3-flash": "zai-org/GLM-5.3-Flash",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForTogetherAI = (
  provider: TogetherAIProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    // Native IDs follow no common scheme: only mapped models are served.
    namespaces: [],
    options: { stripNamespace: false },
  });
