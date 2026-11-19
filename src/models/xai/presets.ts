import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("xai", snapshot as ModelsDevCatalog);

export const grok = defineModelFamily({
  namespace: "xai",
  version: /^xai\/grok-(\d+(?:\.\d+)?)(?:-[a-z0-9-]+)?$/u,
  groups: { transcription: "xai/grok-*-transcribe-*" },
});
