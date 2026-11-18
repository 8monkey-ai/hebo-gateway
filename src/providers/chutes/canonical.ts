import type { ProviderV4 } from "@ai-sdk/provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "minimax/MiniMax-M2.5": "MiniMax/MiniMax-M2.5",
  "alibaba/qwen3.5-397b-a17b": "qwen/qwen3.5-397b-a17b",
  "alibaba/qwen3.8-27b": "Qwen/Qwen3.8-27B-TEE",
  "moonshotai/kimi-k2.5": "moonshotai/Kimi-K2.5",
  "moonshotai/kimi-k3": "moonshotai/Kimi-K3-TEE",
  "zhipuai/glm-5": "zai-org/GLM-5",
  "zhipuai/glm-5.1": "zai-org/GLM-5.1",
  "zhipuai/glm-5.2": "zai-org/GLM-5.2-TEE",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForChutes = (
  provider: ProviderV4,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    // Native IDs follow no common scheme: only mapped models are served.
    namespaces: [],
    options: { stripNamespace: false },
  });
