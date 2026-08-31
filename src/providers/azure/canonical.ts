import type { AzureOpenAIProvider } from "@ai-sdk/azure";

import type { ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

export const withCanonicalIdsForAzure = (
  provider: AzureOpenAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: {
      stripNamespace: true,
    },
  });
