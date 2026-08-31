import { type AzureOpenAIProvider } from "@ai-sdk/azure";

import type { ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

export type AzureCanonicalConfig = {
  /**
   * How the [Azure AI Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints)
   * deployments are named.
   * - `"model"` (default): after the model, which is what Azure suggests when a deployment
   *   is created (`openai/gpt-5.6-luna` resolves to the `gpt-5.6-luna` deployment).
   * - `"canonical"`: after the full canonical ID (`openai/gpt-5.6-luna`).
   */
  deployments?: "model" | "canonical";
  /** Deployment names that follow neither convention, per canonical ID. */
  extraMapping?: Partial<Record<ModelId, string>>;
};

export const withCanonicalIdsForAzure = (
  provider: AzureOpenAIProvider,
  config: AzureCanonicalConfig = {},
) =>
  withCanonicalIds(provider, {
    mapping: config.extraMapping,
    options: {
      // Azure resolves a deployment, not a model, so only the name it was given matters.
      stripNamespace: config.deployments !== "canonical",
    },
  });
