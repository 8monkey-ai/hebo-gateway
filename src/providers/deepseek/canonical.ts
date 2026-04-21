import { type DeepSeekProvider } from "@ai-sdk/deepseek";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "deepseek/deepseek-v3.2": "deepseek-chat",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForDeepSeek = (
  provider: DeepSeekProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: true },
  });
