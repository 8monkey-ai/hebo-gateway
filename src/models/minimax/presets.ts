import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("minimax", snapshot as ModelsDevCatalog);

export const minimax = defineModelFamily({
  namespace: "minimax",
  version: /^minimax\/MiniMax-M(\d+(?:\.\d+)?)(?:-[A-Za-z]+)*$/u,
});
