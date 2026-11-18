import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("minimax", snapshot as ModelCatalog);

export const minimax = defineModelFamily({
  namespace: "minimax",
  version: /^minimax\/MiniMax-M(\d+(?:\.\d+)?)(?:-[A-Za-z]+)*$/u,
});
