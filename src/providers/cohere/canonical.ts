import { type CohereProvider } from "@ai-sdk/cohere";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "cohere/north-small-translate-1-0": "north-small-translate-09-2026",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForCohere = (
  provider: CohereProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    namespaces: ["cohere"],
    options: {
      stripNamespace: true,
    },
  });
