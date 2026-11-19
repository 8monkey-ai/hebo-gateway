import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("moonshotai", snapshot as ModelsDevCatalog);

export const kimi = defineModelFamily({
  namespace: "moonshotai",
  version: /^moonshotai\/kimi-k(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
  prefix: "k",
});
