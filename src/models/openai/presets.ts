import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("openai", snapshot as ModelCatalog);

export const gpt = defineModelFamily({
  namespace: "openai",
  version: /^openai\/gpt-(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
  groups: {
    codex: "openai/gpt-*-codex*",
    pro: "openai/gpt-*-pro",
    transcription: "openai/gpt-*transcribe",
  },
});

export const gptOss = defineModelFamily({
  namespace: "openai",
  version: /^openai\/gpt-oss-/u,
});

export const textEmbeddings = defineModelFamily({
  namespace: "openai",
  version: /^openai\/text-embedding-(\d+)-[a-z]+$/u,
});
