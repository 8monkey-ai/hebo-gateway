import { type GroqProvider } from "@ai-sdk/groq";

import type { CanonicalModelId, ModelId } from "../../models/types";

import { withCanonicalIds } from "../registry";

const MAPPING = {
  "meta/llama-3.1-8b": "llama-3.1-8b-instant",
  "meta/llama-3.3-70b": "llama-3.3-70b-versatile",
  "meta/llama-4-scout": "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta/llama-4-maverick": "meta-llama/llama-4-maverick-17b-128e-instruct",
  "google/gemma-2-9b": "gemma2-9b-it",
  "google/gemma-3-4b": "gemma3-4b-it",
  "google/gemma-3-12b": "gemma3-12b-it",
  "google/gemma-3-27b": "gemma3-27b-it",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForGroq = (
  provider: GroqProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
