import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";

import type { ModelId } from "../../models/types";

import { withCanonicalIds } from "../registry";

export const withCanonicalIdsForVertex = (
  provider: GoogleVertexProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: {
      stripNamespace: true,
      normalizeDelimiters: ["anthropic"],
    },
  });
