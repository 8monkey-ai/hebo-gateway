import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("alibaba", snapshot as ModelCatalog);

export const qwen = defineModelFamily({
  namespace: "alibaba",
  version: /^alibaba\/qwen(\d+(?:\.\d+)?)-/u,
  groups: { embeddings: "alibaba/qwen*-embedding-*" },
});
