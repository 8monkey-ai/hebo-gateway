import { type DeepInfraProvider } from "@ai-sdk/deepinfra";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "deepseek/deepseek-v4-pro-0813": "deepseek-ai/DeepSeek-V4-Pro-0813",
  "deepseek/deepseek-v4.1-flash-1017": "deepseek-ai/DeepSeek-V4.1-Flash",
  "google/gemma-3-4b-it": "google/gemma-3-4b-it",
  "google/gemma-3-12b-it": "google/gemma-3-12b-it",
  "google/gemma-3-27b-it": "google/gemma-3-27b-it",
  "google/gemma-4-26b-a4b-it": "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b-it": "google/gemma-4-31b-it",
  "meta/llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
  "meta/llama-4-scout-17b-instruct": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "minimax/MiniMax-M2.5": "MiniMax/MiniMax-M2.5",
  "alibaba/qwen3.5-397b-a17b": "Qwen/Qwen3.5-397B-A17B",
  "alibaba/qwen3.5-122b-a10b": "Qwen/Qwen3.5-122B-A10B",
  "alibaba/qwen3.5-35b-a3b": "Qwen/Qwen3.5-35B-A3B",
  "alibaba/qwen3.5-27b": "Qwen/Qwen3.5-27B",
  "alibaba/qwen3.5-9b": "Qwen/Qwen3.5-9B",
  "alibaba/qwen3.6-flash": "Qwen/Qwen3.6-35B-A3B",
  "alibaba/qwen3.8-max": "Qwen/Qwen3.8-Max",
  "alibaba/qwen3.8-flash": "Qwen/Qwen3.8-Flash",
  "alibaba/qwen3.8-2.4t-a95b": "Qwen/Qwen3.8-2.4T-A95B",
  "alibaba/qwen3.8-27b": "Qwen/Qwen3.8-27B",
  "moonshotai/kimi-k2.5": "moonshotai/Kimi-K2.5",
  "moonshotai/kimi-k3": "moonshotai/Kimi-K3",
  "zhipuai/glm-5": "zai-org/GLM-5",
  "zhipuai/glm-5.1": "zai-org/GLM-5.1",
  "zhipuai/glm-5.2": "zai-org/GLM-5.2",
  "zhipuai/glm-5.3": "zai-org/GLM-5.3",
  "zhipuai/glm-5.3-flash": "zai-org/GLM-5.3-Flash",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForDeepInfra = (
  provider: DeepInfraProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    // Native IDs follow no common scheme: only mapped models are served.
    namespaces: [],
    options: { stripNamespace: false },
  });
