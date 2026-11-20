import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, SnapshotIds } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "minimax",
  provider: "minimax",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends SnapshotIds<
    typeof import("./models-dev.json", { with: { type: "json" } })
  > {}
}

export const minimax = defineModelFamily(lab, {
  version: /^MiniMax-M(\d+(?:\.\d+)?)(?:-[A-Za-z]+)*$/u,
});
