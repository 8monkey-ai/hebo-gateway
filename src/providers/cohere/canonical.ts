import { type CohereProvider } from "@ai-sdk/cohere";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForCohere = (
  provider: CohereProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "cohere",
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
