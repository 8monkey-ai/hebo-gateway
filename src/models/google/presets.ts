import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, SnapshotIds } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

// models.dev lists these on no gateway provider: Vertex serves them.
const extras: ModelsDevCatalog = {
  "google/gemini-3.5-transcribe": { providers: { vertex: {} } },
  "google/gemini-3.5-transcribe-live": { providers: { vertex: {} } },
  "google/gemini-embedding-2": { providers: { vertex: {} } },
  "google/text-embedding-005": { providers: { vertex: {} } },
  "google/text-multilingual-embedding-002": { providers: { vertex: {} } },
};

const lab = registerModels({
  namespace: "google",
  provider: "vertex",
  snapshot: snapshot as ModelsDevCatalog,
  extras,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends SnapshotIds<
    typeof import("./models-dev.json", { with: { type: "json" } })
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
