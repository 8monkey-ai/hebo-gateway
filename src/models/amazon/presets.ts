import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog, SnapshotIds } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

// Not on models.dev yet.
const extras: ModelsDevCatalog = {
  "amazon/nova-2-multimodal-embeddings": {
    name: "Nova 2 Embeddings",
    family: "nova-embeddings",
    created: "2025-10-28",
    modalities: { input: ["text", "image", "audio", "video", "file"], output: ["embeddings"] },
    context: 8000,
    providers: { bedrock: { id: "amazon.nova-2-multimodal-embeddings-v1:0" } },
  },
};

const lab = registerModels({
  namespace: "amazon",
  provider: "bedrock",
  snapshot: snapshot as ModelsDevCatalog,
  extras,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends SnapshotIds<
    typeof import("./models-dev.json", { with: { type: "json" } })
  > {}
}

export const nova = defineModelFamily(lab, {
  // Nova 1 models carry no version: `amazon/nova-pro`, `amazon/nova-2-lite`.
  version: /^nova-(?:(\d+)-)?[a-z]+(?:-[a-z]+)*$/u,
  groups: { embeddings: "nova-*-embeddings*" },
});
