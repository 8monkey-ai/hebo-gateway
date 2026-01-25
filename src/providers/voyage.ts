import { createVoyage, voyage, VoyageProviderSettings } from "voyage-ai-provider";

import { withCanonicalIds } from "./registry";

export const normalizedVoyage = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(voyage, extraMapping, {
    stripNamespace: true,
  });

export const createNormalizedVoyage = (
  settings: VoyageProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createVoyage(settings), extraMapping, {
    stripNamespace: true,
  });
