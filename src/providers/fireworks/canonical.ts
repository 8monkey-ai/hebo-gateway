import { type FireworksProvider } from "@ai-sdk/fireworks";

import { pickNativeId, registerModelsDevHosts } from "../../models/models-dev.ts";
import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

// Routers (`accounts/fireworks/routers/*`) forward to another model: only a fallback.
registerModelsDevHosts("fireworks", {
  "fireworks-ai": {
    pick: (id, listings) => {
      const models = listings.filter(({ nativeId }) => !nativeId.includes("/routers/"));
      return pickNativeId(id, models.length > 0 ? models : listings);
    },
  },
});

export const withCanonicalIdsForFireworks = (
  provider: FireworksProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "fireworks",
    mapping: extraMapping,
    options: { stripNamespace: false },
  });
