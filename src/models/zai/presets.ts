import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("zhipuai", snapshot as ModelsDevCatalog);

export const glm = defineModelFamily({
  namespace: "zhipuai",
  version: /^zhipuai\/glm-(\d+(?:\.\d+)?)(?:[a-z]*)(?:-[a-z]+)*$/u,
});
