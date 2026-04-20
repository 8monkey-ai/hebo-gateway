import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b",
  "alibaba/qwen3-vl-235b": "qwen3-vl-235b-a22b",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForVertex = (
  provider: GoogleVertexProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
      normalizeDelimiters: ["anthropic"],
    },
  });
