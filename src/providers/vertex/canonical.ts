import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b-instruct-2507-maas",
  "deepseek/deepseek-v3.2": "deepseek-v3.2-maas",
  "anthropic/claude-fable-5": "claude-5-fable@20260609",
  "anthropic/claude-opus-4.8": "claude-opus-4-8@20260528",
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
