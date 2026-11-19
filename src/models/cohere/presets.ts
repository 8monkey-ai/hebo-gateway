import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "cohere",
  provider: "cohere",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const command = defineModelFamily(lab, {
  version: /^command-[a-z]\d*b?(?:-[a-z]+)*-\d{2}-\d{4}$/u,
  groups: { A: "command-a-*", R: "command-r*" },
});

export const north = defineModelFamily(lab, {
  version: /^north-[a-z]+(?:-[a-z]+)*-(\d+-\d+)$/u,
});

export const embed = defineModelFamily(lab, {
  version: /^embed-v(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
});
