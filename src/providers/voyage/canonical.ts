import type { VoyageProvider } from "voyage-ai-provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForVoyage = (
  provider: VoyageProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "voyage",
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
