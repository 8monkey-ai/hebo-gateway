import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("amazon", snapshot as ModelCatalog);

export const nova = defineModelFamily({
  namespace: "amazon",
  // Nova 1 models carry no version: `amazon/nova-pro`, `amazon/nova-2-lite`.
  version: /^amazon\/nova-(?:(\d+)-)?[a-z]+(?:-[a-z]+)*$/u,
  groups: { embeddings: "amazon/nova-*-embeddings*" },
});
