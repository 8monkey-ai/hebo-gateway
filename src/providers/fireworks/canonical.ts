import { type FireworksProvider } from "@ai-sdk/fireworks";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "meta/llama-3.3-70b-instruct": "accounts/fireworks/models/llama-v3p3-70b-instruct",
  "deepseek/deepseek-v4.1-flash-1017": "accounts/fireworks/models/deepseek-v4p1-flash",
  "openai/gpt-oss-20b": "accounts/fireworks/models/gpt-oss-20b",
  "openai/gpt-oss-120b": "accounts/fireworks/models/gpt-oss-120b",
  "alibaba/qwen3.5-397b-a17b": "accounts/fireworks/models/qwen3p5-397b-a17b",
  "alibaba/qwen3.5-35b-a3b": "accounts/fireworks/models/qwen3p5-35b-a3b",
  "alibaba/qwen3.5-27b": "accounts/fireworks/models/qwen3p5-27b",
  "alibaba/qwen3.5-9b": "accounts/fireworks/models/qwen3p5-9b",
  "alibaba/qwen3.8-2.4t-a95b": "accounts/fireworks/models/qwen3p8-2p4t-a95b",
  "moonshotai/kimi-k2.5": "accounts/fireworks/models/kimi-k2p5",
  "moonshotai/kimi-k2.6": "accounts/fireworks/models/kimi-k2p6",
  "moonshotai/kimi-k3": "accounts/fireworks/models/kimi-k3",
  "zhipuai/glm-5": "accounts/fireworks/models/glm-5",
  "zhipuai/glm-5.1": "accounts/fireworks/models/glm-5p1",
  "zhipuai/glm-5.3": "accounts/fireworks/models/glm-5p3",
  "zhipuai/glm-5.3-flash": "accounts/fireworks/models/glm-5p3-flash",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForFireworks = (
  provider: FireworksProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    // Native IDs follow no common scheme: only mapped models are served.
    namespaces: [],
    options: { stripNamespace: false },
  });
