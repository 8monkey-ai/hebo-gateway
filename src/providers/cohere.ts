import { createCohere, cohere, CohereProviderSettings } from "@ai-sdk/cohere";

import { withCanonicalIds } from "./registry";

export const cohereWithCanonicalIds = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(cohere, extraMapping, {
    stripNamespace: true,
  });

export const createCohereWithCanonicalIds = (
  settings: CohereProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createCohere(settings), extraMapping, {
    stripNamespace: true,
  });
