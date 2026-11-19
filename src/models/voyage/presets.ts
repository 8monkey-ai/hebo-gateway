import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, ModelsDevCatalogModel } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const embedding = (name: string, created: string): ModelsDevCatalogModel => ({
  name,
  family: "voyage",
  created,
  modalities: { input: ["text"], output: ["embeddings"] },
  context: 32000,
  providers: { voyage: {} },
});

// Voyage is not a models.dev provider, which only lists its newest models.
const extras: ModelsDevCatalog = {
  "voyageai/voyage-3.5": embedding("Voyage 3.5", "2025-05-20"),
  "voyageai/voyage-3.5-lite": embedding("Voyage 3.5 Lite", "2025-05-20"),
  "voyageai/voyage-3-large": embedding("Voyage 3 Large", "2025-01-07"),
  "voyageai/voyage-code-3": embedding("Voyage Code 3", "2024-12-04"),
};

const lab = registerModels({
  namespace: "voyageai",
  provider: "voyage",
  snapshot: snapshot as ModelsDevCatalog,
  extras,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const voyage = defineModelFamily(lab, {
  version: /^voyage-(?:[a-z]+-)?(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
});
