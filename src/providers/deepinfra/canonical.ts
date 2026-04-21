import { type DeepInfraProvider } from "@ai-sdk/deepinfra";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "google/gemma-3-4b": "google/gemma-3-4b-it",
  "google/gemma-3-12b": "google/gemma-3-12b-it",
  "google/gemma-3-27b": "google/gemma-3-27b-it",
  "google/gemma-4-26b-a4b": "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b": "google/gemma-4-31b-it",
  "meta/llama-3.1-8b": "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "meta/llama-3.1-70b": "meta-llama/Meta-Llama-3.1-70B-Instruct",
  "meta/llama-3.1-405b": "meta-llama/Meta-Llama-3.1-405B-Instruct",
  "meta/llama-3.2-11b": "meta-llama/Llama-3.2-11B-Vision-Instruct",
  "meta/llama-3.2-90b": "meta-llama/Llama-3.2-90B-Vision-Instruct",
  "meta/llama-3.3-70b": "meta-llama/Llama-3.3-70B-Instruct",
  "meta/llama-4-scout": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "meta/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
  "alibaba/qwen3-235b": "Qwen/Qwen3-235B-A22B",
  "alibaba/qwen3-32b": "Qwen/Qwen3-32B",
  "alibaba/qwen3.5-397b": "Qwen/Qwen3.5-397B-A17B",
  "alibaba/qwen3.5-122b": "Qwen/Qwen3.5-122B-A10B",
  "alibaba/qwen3.5-35b": "Qwen/Qwen3.5-35B-A3B",
  "alibaba/qwen3.5-27b": "Qwen/Qwen3.5-27B",
  "alibaba/qwen3.5-9b": "Qwen/Qwen3.5-9B",
  "alibaba/qwen3.5-4b": "Qwen/Qwen3.5-4B",
  "alibaba/qwen3.5-2b": "Qwen/Qwen3.5-2B",
  "alibaba/qwen3.5-0.8b": "Qwen/Qwen3.5-0.8B",
  "alibaba/qwen3.6-flash": "Qwen/Qwen3.6-35B-A3B",
  "alibaba/qwen3-embedding-0.6b": "Qwen/Qwen3-Embedding-0.6B",
  "alibaba/qwen3-embedding-4b": "Qwen/Qwen3-Embedding-4B",
  "alibaba/qwen3-embedding-8b": "Qwen/Qwen3-Embedding-8B",
  "deepseek/deepseek-v3.2": "deepseek-ai/DeepSeek-V3.2",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForDeepInfra = (
  provider: DeepInfraProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
