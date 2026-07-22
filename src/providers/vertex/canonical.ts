import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";
import { createVertexMaas } from "@ai-sdk/google-vertex/maas";
import { customProvider } from "ai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b-instruct-2507-maas",
  "deepseek/deepseek-v3.2": "deepseek-v3.2-maas",
  "google/gemma-4-26b-a4b": "gemma-4-26b-a4b-it-maas",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForVertex = (
  provider: GoogleVertexProvider,
  extraMapping?: Record<ModelId, string>,
) => {
  // Gemma thinking is not exposed via generateContent, so it routes through the
  // MaaS endpoint, which serves Gemma only from the global endpoint.
  const maas = createVertexMaas({ location: "global" });

  const base = withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
      normalizeDelimiters: ["anthropic"],
    },
  });

  return customProvider({
    languageModels: {
      get "google/gemma-4-26b-a4b"() {
        return maas.languageModel("google/gemma-4-26b-a4b-it-maas");
      },
    },
    fallbackProvider: base,
  });
};
