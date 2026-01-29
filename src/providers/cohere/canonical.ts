import { type CohereProvider } from "@ai-sdk/cohere";

import type { CanonicalModelId, ModelId } from "../../models/types";

import { withCanonicalIds } from "../registry";

const MAPPING = {
  "cohere/command-a": "command-a-03-2025",
  "cohere/command-r7b": "command-r7b-12-2024",
  "cohere/command-a-translate": "command-a-translate-08-2025",
  "cohere/command-a-reasoning": "command-a-reasoning-08-2025",
  "cohere/command-a-vision": "command-a-vision-07-2025",
  "cohere/command-r": "command-r-08-2024",
  "cohere/command-r-plus": "command-r-plus-08-2024",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForCohere = (
  provider: CohereProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
    },
  });
