import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("deepseek", snapshot as ModelsDevCatalog);

export const deepseek = defineModelFamily({
  namespace: "deepseek",
  version: /^deepseek\/deepseek-v(\d+(?:\.\d+)?)(?:-[a-z]+)*(?:-\d{4})?$/u,
});
