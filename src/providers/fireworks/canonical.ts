import { type FireworksProvider } from "@ai-sdk/fireworks";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForFireworks = (
  provider: FireworksProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: { stripNamespace: false },
  });
