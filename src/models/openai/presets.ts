import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, SnapshotIds } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

// models.dev lists these on no gateway provider: OpenAI serves them.
const extras: ModelsDevCatalog = {
  "openai/gpt-transcribe": { providers: { openai: {} } },
  "openai/gpt-live-transcribe": { providers: { openai: {} } },
  "openai/gpt-4o-transcribe": { providers: { openai: {} } },
  "openai/gpt-4o-mini-transcribe": { providers: { openai: {} } },
  "openai/gpt-realtime-whisper": { providers: { openai: {} } },
  "openai/whisper-1": { providers: { openai: {} } },
};

const lab = registerModels({
  namespace: "openai",
  provider: "openai",
  snapshot: snapshot as ModelsDevCatalog,
  extras,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends SnapshotIds<
    typeof import("./models-dev.json", { with: { type: "json" } })
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
  version: /^gpt-oss-\d+b$/u,
});

// Safety classifiers, not chat models. models.dev files them under the `gpt-oss` family, so
// they would otherwise join `gptOss.all` and, being newer, replace it as `gptOss.latest`.
export const gptOssSafeguard = defineModelFamily(lab, {
  version: /^gpt-oss-safeguard-\d+b$/u,
});

export const textEmbeddings = defineModelFamily(lab, {
  version: /^text-embedding-(\d+)-[a-z]+$/u,
});
