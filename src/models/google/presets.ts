import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("google", snapshot as ModelCatalog);

export const gemini = defineModelFamily({
  namespace: "google",
  version: /^google\/gemini-(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
  groups: {
    preview: "google/gemini-*-preview*",
    embeddings: "google/gemini-embedding-*",
    transcription: "google/gemini-*-transcribe*",
  },
});

export const gemma = defineModelFamily({
  namespace: "google",
  version: /^google\/gemma-(\d+(?:\.\d+)?)-/u,
});
