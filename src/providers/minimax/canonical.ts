import type { ProviderV4 } from "@ai-sdk/provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForMinimax = (
  provider: ProviderV4,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    namespaces: ["minimax"],
    options: { stripNamespace: true },
  });
