import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("cohere", snapshot as ModelsDevCatalog);

export const command = defineModelFamily({
  namespace: "cohere",
  version: /^cohere\/command-[a-z]\d*b?(?:-[a-z]+)*-\d{2}-\d{4}$/u,
  groups: { A: "cohere/command-a-*", R: "cohere/command-r*" },
});

export const north = defineModelFamily({
  namespace: "cohere",
  version: /^cohere\/north-[a-z]+(?:-[a-z]+)*-(\d+-\d+)$/u,
});

export const embed = defineModelFamily({
  namespace: "cohere",
  version: /^cohere\/embed-v(\d+(?:\.\d+)?)(?:-[a-z]+)*$/u,
});
