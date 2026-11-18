import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

// Not on models.dev yet. Served by Azure's Speech API (not Azure OpenAI deployments).
const extras: ModelCatalog = {
  "microsoft/mai-transcribe-2": {
    name: "MAI-Transcribe 2",
    created: "2026-09-03",
    modalities: { input: ["audio"], output: ["transcription"] },
    providers: { azure: "mai-transcribe-2" },
  },
};

registerModels("microsoft", snapshot as ModelCatalog, extras);

export const maiTranscribe = defineModelFamily({
  namespace: "microsoft",
  version: /^microsoft\/mai-transcribe-(\d+(?:\.\d+)?)$/u,
});
