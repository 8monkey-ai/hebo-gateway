import { type FireworksProvider } from "@ai-sdk/fireworks";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "minimax/m2.7": "accounts/fireworks/models/minimax-m2",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForFireworks = (
  provider: FireworksProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
