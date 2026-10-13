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

const deepseekAtomic = {
  v4: [deepseekV4Pro],
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
