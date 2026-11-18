import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("moonshotai", snapshot as ModelCatalog);

export const kimi = defineModelFamily({
  namespace: "moonshotai",
  version: /^moonshotai\/kimi-k(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
  prefix: "k",
});
