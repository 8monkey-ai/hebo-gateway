import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, SnapshotIds } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "zhipuai",
  provider: "zai",
  host: "zai",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends SnapshotIds<
    typeof import("./models-dev.json", { with: { type: "json" } })
  > {}
}

export const glm = defineModelFamily(lab, {
  version: /^glm-(\d+(?:\.\d+)?)(?:[a-z]*)(?:-[a-z]+)*$/u,
});
