import { type DeepSeekProvider } from "@ai-sdk/deepseek";

import type { ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

export const withCanonicalIdsForDeepSeek = (
  provider: DeepSeekProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
