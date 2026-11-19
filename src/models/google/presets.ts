import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "google",
  provider: "vertex",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const gemini = defineModelFamily(lab, {
  // Transcription models are only in `transcription` (and `all`), not in version groups.
  version: /^gemini-(\d+(?:\.\d+)?)(?:-(?!transcribe)[a-z]+)*$/u,
  groups: {
    preview: "gemini-*-preview*",
    embeddings: "gemini-embedding-*",
    transcription: "gemini-*-transcribe*",
  },
});

export const gemma = defineModelFamily(lab, {
  version: /^gemma-(\d+(?:\.\d+)?)-/u,
});
