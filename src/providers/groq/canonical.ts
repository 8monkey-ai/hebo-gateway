import { type GroqProvider } from "@ai-sdk/groq";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "meta/llama-3.3-70b-instruct": "llama-3.3-70b-versatile",
  "meta/llama-4-scout-17b-instruct": "meta-llama/llama-4-scout-17b-16e-instruct",
  "alibaba/qwen3.8-27b": "qwen/qwen3.8-27b",
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForGroq = (
  provider: GroqProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    // Native IDs follow no common scheme: only mapped models are served.
    namespaces: [],
    options: { stripNamespace: false },
  });
