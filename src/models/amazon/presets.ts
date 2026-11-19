import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "amazon",
  provider: "bedrock",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const nova = defineModelFamily(lab, {
  // Nova 1 models carry no version: `amazon/nova-pro`, `amazon/nova-2-lite`.
  version: /^nova-(?:(\d+)-)?[a-z]+(?:-[a-z]+)*$/u,
  groups: { embeddings: "nova-*-embeddings*" },
});
