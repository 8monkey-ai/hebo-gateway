import { type DeepSeekProvider } from "@ai-sdk/deepseek";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForDeepSeek = (
  provider: DeepSeekProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "deepseek",
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
