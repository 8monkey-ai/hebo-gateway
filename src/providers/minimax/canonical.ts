import type { ProviderV4 } from "@ai-sdk/provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForMinimax = (
  provider: ProviderV4,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
