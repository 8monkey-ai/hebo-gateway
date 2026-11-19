import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

registerModels("anthropic", snapshot as ModelsDevCatalog);

export const claude = defineModelFamily({
  namespace: "anthropic",
  version: /^anthropic\/claude-[a-z]+-(\d+(?:-\d)?)(?:-\d{8})?$/u,
  groups: {
    opus: "anthropic/claude-opus-*",
    sonnet: "anthropic/claude-sonnet-*",
    haiku: "anthropic/claude-haiku-*",
    fable: "anthropic/claude-fable-*",
  },
});
