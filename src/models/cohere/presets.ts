import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, ModelsDevCatalogModel } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const embedV3 = (name: string, bedrock?: string): ModelsDevCatalogModel => ({
  name,
  family: "cohere-embed",
  created: "2024-02-07",
  modalities: { input: ["text", "image"], output: ["embeddings"] },
  context: 512,
  providers: { cohere: {}, ...(bedrock && { bedrock: { id: bedrock }, azure: {} }) },
});

// Not on models.dev yet.
const extras: ModelsDevCatalog = {
  "cohere/embed-english-v3.0": embedV3("Cohere Embed English v3", "cohere.embed-english-v3"),
  "cohere/embed-english-light-v3.0": embedV3("Cohere Embed English Light v3"),
  "cohere/embed-multilingual-v3.0": embedV3(
    "Cohere Embed Multilingual v3",
    "cohere.embed-multilingual-v3",
  ),
  "cohere/embed-multilingual-light-v3.0": embedV3("Cohere Embed Multilingual Light v3"),
};

const lab = registerModels({
  namespace: "cohere",
  provider: "cohere",
  snapshot: snapshot as ModelsDevCatalog,
  extras,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const command = defineModelFamily(lab, {
  version: /^command-[a-z]\d*b?(?:-[a-z]+)*-\d{2}-\d{4}$/u,
  groups: { A: "command-a-*", R: "command-r*" },
});

export const north = defineModelFamily(lab, {
  version: /^north-[a-z]+(?:-[a-z]+)*-(\d+-\d+)$/u,
});

export const embed = defineModelFamily(lab, {
  version: /^embed-(?:[a-z]+-)*v(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
});
