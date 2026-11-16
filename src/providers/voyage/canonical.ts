import type { VoyageProvider } from "voyage-ai-provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForVoyage = (
  provider: VoyageProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
