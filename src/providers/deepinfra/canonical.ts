import { type DeepInfraProvider } from "@ai-sdk/deepinfra";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForDeepInfra = (
  provider: DeepInfraProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: { stripNamespace: false },
  });
