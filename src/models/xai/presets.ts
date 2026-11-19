import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "xai",
  provider: "xai",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const grok = defineModelFamily(lab, {
  version: /^grok-(\d+(?:\.\d+)?)(?:-[a-z0-9-]+)?$/u,
  groups: { transcription: "grok-*-transcribe-*" },
});
