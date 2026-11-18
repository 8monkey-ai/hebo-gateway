import type { AlibabaProvider } from "@ai-sdk/alibaba";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  // Qwen 3.6 Flash is served under its open-weights name.
  "alibaba/qwen3.6-flash": "qwen3.6-35b-a3b",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForAlibaba = (
  provider: AlibabaProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
  });
