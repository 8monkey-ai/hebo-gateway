import { type MoonshotAIProvider } from "@ai-sdk/moonshotai";

import { registerModelsDevHosts } from "../../models/models-dev.ts";
import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

registerModelsDevHosts("moonshot", { moonshotai: {} });

export const withCanonicalIdsForMoonshot = (
  provider: MoonshotAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "moonshot",
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
