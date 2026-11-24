import type { AzureOpenAIProvider } from "@ai-sdk/azure";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForAzure = (
  provider: AzureOpenAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "azure",
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
