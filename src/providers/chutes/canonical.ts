import type { ProviderV3 } from "@ai-sdk/provider";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
  "alibaba/qwen3-32b": "qwen/qwen3-32b",
  "alibaba/qwen3.5-397b": "qwen/qwen3.5-397b-a17b",
  "zhipu/glm-5": "zai-org/GLM-5",
  "zhipu/glm-5.1": "zai-org/GLM-5.1",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForChutes = (
  provider: ProviderV3,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
