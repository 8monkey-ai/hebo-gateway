import { type GroqProvider } from "@ai-sdk/groq";

import type { CanonicalModelId, ModelId } from "../../models/types";

import { withCanonicalIds } from "../registry";

const MAPPING = {
  "meta/llama-3.1-8b": "llama-3.1-8b-instant",
  "meta/llama-3.3-70b": "llama-3.3-70b-versatile",
  "meta/llama-4-scout": "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta/llama-4-maverick": "meta-llama/llama-4-maverick-17b-128e-instruct",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForGroq = (
  provider: GroqProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
