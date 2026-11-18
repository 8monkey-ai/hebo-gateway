import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("meta", snapshot as ModelCatalog);

export const llama = defineModelFamily({
  namespace: "meta",
  version: /^meta\/llama-(\d+(?:\.\d+)?)-/u,
});
