import { type FireworksProvider } from "@ai-sdk/fireworks";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "meta/llama-3.1-8b": "accounts/fireworks/models/llama-v3p1-8b-instruct",
  "meta/llama-3.1-405b": "accounts/fireworks/models/llama-v3p1-405b-instruct",
  "meta/llama-3.2-3b": "accounts/fireworks/models/llama-v3p2-3b-instruct",
  "meta/llama-3.2-11b": "accounts/fireworks/models/llama-v3p2-11b-vision-instruct",
  "meta/llama-3.3-70b": "accounts/fireworks/models/llama-v3p3-70b-instruct",
  "openai/gpt-oss-20b": "accounts/fireworks/models/gpt-oss-20b",
  "openai/gpt-oss-120b": "accounts/fireworks/models/gpt-oss-120b",
  "minimax/m2.7": "accounts/fireworks/models/minimax-m2p7",
  "alibaba/qwen3-235b": "accounts/fireworks/models/qwen3-235b-a22b",
  "alibaba/qwen3-32b": "accounts/fireworks/models/qwen3-32b",
  "alibaba/qwen3.5-397b": "accounts/fireworks/models/qwen3p5-397b-a17b",
  "alibaba/qwen3.5-35b": "accounts/fireworks/models/qwen3p5-35b-a3b",
  "alibaba/qwen3.5-27b": "accounts/fireworks/models/qwen3p5-27b",
  "alibaba/qwen3.5-9b": "accounts/fireworks/models/qwen3p5-9b",
  "moonshot/kimi-k2.5": "accounts/fireworks/models/kimi-k2p5",
  "moonshot/kimi-k2.6": "accounts/fireworks/models/kimi-k2p6",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForFireworks = (
  provider: FireworksProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
