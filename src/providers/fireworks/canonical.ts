import { type FireworksProvider } from "@ai-sdk/fireworks";

import { registerModelsDevHosts } from "../../models/models-dev.ts";
import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

registerModelsDevHosts("fireworks", { "fireworks-ai": [] });

export const withCanonicalIdsForFireworks = (
  provider: FireworksProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "fireworks",
    mapping: extraMapping,
    options: { stripNamespace: false },
  });
