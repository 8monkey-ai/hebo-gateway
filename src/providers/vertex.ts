import { createVertex, vertex, type GoogleVertexProviderSettings } from "@ai-sdk/google-vertex";

import { withCanonicalIds } from "./registry";

export const vertexWithCanonicalIds = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(vertex, extraMapping, {
    stripNamespace: true,
    replaceDots: ["anthropic"],
  });

export const createVertexWithCanonicalIds = (
  settings: GoogleVertexProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createVertex(settings), extraMapping, {
    stripNamespace: true,
    replaceDots: ["anthropic"],
  });
