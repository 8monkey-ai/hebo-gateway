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
    "deepinfra",
    "fireworks",
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

const deepseekAtomic = {
  "v3.2": [deepseekV32],
} as const;

const deepseekGroups = {} as const;

export const deepseek = {
  ...deepseekAtomic,
  ...deepseekGroups,
  latest: [...deepseekAtomic["v3.2"]],
  all: Object.values(deepseekAtomic).flat(),
} as const;
