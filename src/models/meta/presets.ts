import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("meta", snapshot as ModelsDevCatalog);

export const llama = defineModelFamily({
  namespace: "meta",
  version: /^meta\/llama-(\d+(?:\.\d+)?)-/u,
});
