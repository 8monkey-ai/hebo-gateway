import { registerModels } from "../catalog.ts";
import { defineModelFamily } from "../family.ts";
import type { ModelsDevCatalog } from "../types.ts";
import snapshot from "./models-dev.json" with { type: "json" };

const lab = registerModels({
  namespace: "anthropic",
  provider: "anthropic",
  // Claude 4.5 can't think adaptively, which every later model does without a budget.
  exclude: ["claude-*-4-5*"],
  snapshot: snapshot as ModelsDevCatalog,
});

// Adds the snapshot's model IDs to `CanonicalModelId`.
declare module "../types.ts" {
  interface CanonicalModelIds extends Record<
    keyof typeof import("./models-dev.json", { with: { type: "json" } }),
    true
  > {}
}

export const claude = defineModelFamily(lab, {
  version: /^claude-[a-z]+-(\d+(?:-\d)?)(?:-\d{8})?$/u,
  groups: {
    opus: "claude-opus-*",
    sonnet: "claude-sonnet-*",
    haiku: "claude-haiku-*",
    fable: "claude-fable-*",
  },
});
