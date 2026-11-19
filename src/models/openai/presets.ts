import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "openai",
  provider: "openai",
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const gpt = defineModelFamily(lab, {
  version: /^gpt-(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
  groups: {
    codex: "gpt-*-codex*",
    pro: "gpt-*-pro",
    transcription: "gpt-*transcribe",
  },
});

export const gptOss = defineModelFamily(lab, {
  version: /^gpt-oss-/u,
});

export const textEmbeddings = defineModelFamily(lab, {
  version: /^text-embedding-(\d+)-[a-z]+$/u,
});
