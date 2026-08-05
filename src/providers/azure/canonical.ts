import { type AzureOpenAIProvider } from "@ai-sdk/azure";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

// Azure resolves models by *deployment* name, which defaults to the model ID listed in:
//   https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure
// Deployments named after the canonical ID need no mapping; the entries below cover
// families whose Azure model IDs differ from the canonical `vendor/model` form.
const MAPPING = {
  "anthropic/claude-haiku-4.5": "claude-haiku-4-5",
  "anthropic/claude-sonnet-4.5": "claude-sonnet-4-5",
  "anthropic/claude-sonnet-4.6": "claude-sonnet-4-6",
  "anthropic/claude-opus-4.1": "claude-opus-4-1",
  "anthropic/claude-opus-4.5": "claude-opus-4-5",
  "anthropic/claude-opus-4.6": "claude-opus-4-6",
  "anthropic/claude-opus-4.8": "claude-opus-4-8",
  "cohere/command-a": "cohere-command-a",
  "cohere/embed-v4.0": "cohere-embed-v-4-0",
  "cohere/embed-english-v3.0": "cohere-embed-v3-english",
  "cohere/embed-multilingual-v3.0": "cohere-embed-v3-multilingual",
  "meta/llama-3.3-70b": "llama-3.3-70b-instruct",
  "meta/llama-4-scout": "llama-4-scout-17b-16e-instruct",
  "meta/llama-4-maverick": "llama-4-maverick-17b-128e-instruct-fp8",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForAzure = (
  provider: AzureOpenAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
    },
  });
