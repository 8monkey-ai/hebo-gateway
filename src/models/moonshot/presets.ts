import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const KIMI_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
  context: 262144,
  providers: ["moonshot"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const kimiK25 = presetFor<CanonicalModelId, CatalogModel>()(
  "moonshot/kimi-k2.5" as const,
  {
    ...KIMI_BASE,
    name: "Kimi K2.5",
    created: "2026-01-27",
    knowledge: "2025-06",
  } satisfies CatalogModel,
);

export const kimiK26 = presetFor<CanonicalModelId, CatalogModel>()(
  "moonshot/kimi-k2.6" as const,
  {
    ...KIMI_BASE,
    name: "Kimi K2.6",
    created: "2026-04-20",
  } satisfies CatalogModel,
);

const kimiAtomic = {
  "k2.5": [kimiK25],
  "k2.6": [kimiK26],
} as const;

const kimiGroups = {
  "k2.x": [...kimiAtomic["k2.5"], ...kimiAtomic["k2.6"]],
} as const;

export const kimi = {
  ...kimiAtomic,
  ...kimiGroups,
  latest: [...kimiAtomic["k2.6"]],
  all: Object.values(kimiAtomic).flat(),
} as const;
