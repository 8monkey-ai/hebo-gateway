import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const DEEPSEEK_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
  providers: [
    "deepseek",
    "alibaba",
    "deepinfra",
    "fireworks",
    "chutes",
    "vertex",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const deepseekV4Pro = presetFor<CanonicalModelId, CatalogModel>()(
  "deepseek/deepseek-v4-pro" as const,
  {
    ...DEEPSEEK_BASE,
    name: "DeepSeek V4 Pro",
    created: "2026-04-23",
    knowledge: "2025-05",
    context: 1_000_000,
  } satisfies CatalogModel,
);

export const deepseekV41Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "deepseek/deepseek-v4.1-flash" as const,
  {
    ...DEEPSEEK_BASE,
    name: "DeepSeek V4.1 Flash",
    created: "2026-09-10",
    knowledge: "2025-05",
    context: 1_000_000,
    modalities: {
      input: ["text", "image"] as const,
      output: ["text"] as const,
    },
    capabilities: [...DEEPSEEK_BASE.capabilities, "attachments"],
    providers: [
      "deepseek",
      "azure",
      "deepinfra",
      "fireworks",
      "togetherai",
    ] as const satisfies readonly CanonicalProviderId[],
  } satisfies CatalogModel,
);

const deepseekAtomic = {
  v4: [deepseekV4Pro],
  "v4.1": [deepseekV41Flash],
} as const;

const deepseekGroups = {
  "v4.x": [...deepseekAtomic["v4"], ...deepseekAtomic["v4.1"]],
} as const;

export const deepseek = {
  ...deepseekAtomic,
  ...deepseekGroups,
  // V4.1 Flash is the newest release; V4 Pro is still the frontier model.
  latest: [deepseekV4Pro, deepseekV41Flash],
  all: Object.values(deepseekAtomic).flat(),
} as const;
