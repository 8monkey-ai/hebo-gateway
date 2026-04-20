import type { ProviderV3 } from "@ai-sdk/provider";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForChutes = (
  provider: ProviderV3,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
