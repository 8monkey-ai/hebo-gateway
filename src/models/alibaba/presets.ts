import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, ModelsDevCatalogModel } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const embedding = (name: string, deepinfra: string, azure = true): ModelsDevCatalogModel => ({
  name,
  family: "qwen3-embedding",
  created: "2025-06-05",
  modalities: { input: ["text"], output: ["embeddings"] },
  context: 32768,
  providers: { alibaba: {}, ...(azure && { azure: {} }), deepinfra: { id: deepinfra } },
});

// Not on models.dev yet.
const extras: ModelsDevCatalog = {
  "alibaba/qwen3-embedding-0.6b": embedding("Qwen3 Embedding 0.6B", "Qwen/Qwen3-Embedding-0.6B"),
  "alibaba/qwen3-embedding-4b": embedding("Qwen3 Embedding 4B", "Qwen/Qwen3-Embedding-4B", false),
  "alibaba/qwen3-embedding-8b": embedding("Qwen3 Embedding 8B", "Qwen/Qwen3-Embedding-8B"),
};

const lab = registerModels({
  namespace: "alibaba",
  provider: "alibaba",
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

export const qwen = defineModelFamily(lab, {
  // Embedding models are only in `embeddings` (and `all`), not in version groups.
  version: /^qwen(\d+(?:\.\d+)?)-(?!embedding-)/u,
  groups: { embeddings: "qwen*-embedding-*" },
});
