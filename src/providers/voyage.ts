import { createVoyage, voyage, type VoyageProviderSettings } from "voyage-ai-provider";

import { withCanonicalIds } from "./registry";

export const voyageWithCanonicalIds = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(voyage, extraMapping, {
    stripNamespace: true,
  });

export const createVoyageWithCanonicalIds = (
  settings: VoyageProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createVoyage(settings), extraMapping, {
    stripNamespace: true,
  });
