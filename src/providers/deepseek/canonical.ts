import { type DeepSeekProvider } from "@ai-sdk/deepseek";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  // DeepSeek serves its newest Flash release from the undated `deepseek-flash` alias.
  "deepseek/deepseek-v4.1-flash": "deepseek-flash",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForDeepSeek = (
  provider: DeepSeekProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: true },
  });
