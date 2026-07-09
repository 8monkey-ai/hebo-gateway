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

export const deepseekV32 = presetFor<CanonicalModelId, CatalogModel>()(
  "deepseek/deepseek-v3.2" as const,
  {
    ...DEEPSEEK_BASE,
    name: "DeepSeek V3.2",
    created: "2025-12-01",
    knowledge: "2024-12",
    context: 131072,
  } satisfies CatalogModel,
);

export const deepseekV4Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "deepseek/deepseek-v4-flash" as const,
  {
    ...DEEPSEEK_BASE,
    name: "DeepSeek V4 Flash",
    created: "2026-04-23",
    knowledge: "2025-05",
    context: 1_000_000,
  } satisfies CatalogModel,
);

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

const deepseekAtomic = {
  "v3.2": [deepseekV32],
  v4: [deepseekV4Flash, deepseekV4Pro],
} as const;

const deepseekGroups = {
  "v4.x": [...deepseekAtomic["v4"]],
} as const;

export const deepseek = {
  ...deepseekAtomic,
  ...deepseekGroups,
  latest: [...deepseekAtomic["v4"]],
  all: Object.values(deepseekAtomic).flat(),
} as const;
