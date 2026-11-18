import { type MoonshotAIProvider } from "@ai-sdk/moonshotai";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForMoonshot = (
  provider: MoonshotAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    namespaces: ["moonshotai"],
    options: { stripNamespace: true },
  });
