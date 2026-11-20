import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, SnapshotIds } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

// models.dev lists it on no gateway provider: xAI serves it.
const extras: ModelsDevCatalog = {
  "xai/grok-voice-transcribe-2.0": { providers: { xai: {} } },
};

const lab = registerModels({
  namespace: "xai",
  provider: "xai",
  snapshot: snapshot as ModelsDevCatalog,
  extras,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends SnapshotIds<
    typeof import("./models-dev.json", { with: { type: "json" } })
  > {}
}

export const grok = defineModelFamily(lab, {
  version: /^grok-(\d+(?:\.\d+)?)(?:-[a-z0-9-]+)?$/u,
  groups: { transcription: "grok-*-transcribe-*" },
});
