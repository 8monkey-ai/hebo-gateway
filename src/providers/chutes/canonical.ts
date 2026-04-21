import type { ProviderV3 } from "@ai-sdk/provider";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
  "alibaba/qwen3-32b": "qwen/qwen3-32b",
  "alibaba/qwen3.5-397b": "qwen/qwen3.5-397b-a17b",
  "deepseek/deepseek-v3.2": "deepseek-ai/DeepSeek-V3.2-TEE",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForChutes = (
  provider: ProviderV3,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
