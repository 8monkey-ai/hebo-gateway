import { createVertex, vertex, GoogleVertexProviderSettings } from "@ai-sdk/google-vertex";

import { withCanonicalIds } from "./registry";

export const normalizedVertex = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(vertex, extraMapping, {
    stripNamespace: true,
    replaceDots: ["anthropic"],
  });

export const createNormalizedVertex = (
  settings: GoogleVertexProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createVertex(settings), extraMapping, {
    stripNamespace: true,
    replaceDots: ["anthropic"],
  });
