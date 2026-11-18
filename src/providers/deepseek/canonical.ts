import { type DeepSeekProvider } from "@ai-sdk/deepseek";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  // DeepSeek serves its newest Flash release from the undated `deepseek-flash` alias.
  "deepseek/deepseek-v4.1-flash-1017": "deepseek-flash",
  "deepseek/deepseek-v4-pro-0813": "deepseek-v4-pro",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForDeepSeek = (
  provider: DeepSeekProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    namespaces: ["deepseek"],
    options: { stripNamespace: true },
  });
