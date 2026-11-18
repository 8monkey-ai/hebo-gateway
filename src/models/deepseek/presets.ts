import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("deepseek", snapshot as ModelCatalog);

export const deepseek = defineModelFamily({
  namespace: "deepseek",
  version: /^deepseek\/deepseek-v(\d+(?:\.\d+)?)(?:-[a-z]+)*(?:-\d{4})?$/u,
});
