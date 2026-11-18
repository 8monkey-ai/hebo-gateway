import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("xai", snapshot as ModelCatalog);

export const grok = defineModelFamily({
  namespace: "xai",
  version: /^xai\/grok-(\d+(?:\.\d+)?)(?:-[a-z0-9-]+)?$/u,
  groups: { transcription: "xai/grok-*-transcribe-*" },
});
