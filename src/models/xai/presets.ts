import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const GROK_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "structured_output", "temperature"] as const,
  providers: ["xai"] as const satisfies readonly CanonicalProviderId[],
  context: 2000000,
} satisfies DeepPartial<CatalogModel>;

const GROK_REASONING_BASE = {
  ...GROK_BASE,
  capabilities: ["tool_call", "structured_output", "reasoning", "temperature"] as const,
} satisfies DeepPartial<CatalogModel>;

export const grok41Fast = presetFor<CanonicalModelId, CatalogModel>()(
  "xai/grok-4.1-fast" as const,
  {
    ...GROK_BASE,
    name: "Grok 4.1 Fast",
    created: "2025-11-20",
    knowledge: "2025-06",
  } satisfies CatalogModel,
);

export const grok41FastReasoning = presetFor<CanonicalModelId, CatalogModel>()(
  "xai/grok-4.1-fast-reasoning" as const,
  {
    ...GROK_REASONING_BASE,
    name: "Grok 4.1 Fast Reasoning",
    created: "2025-11-20",
    knowledge: "2025-06",
  } satisfies CatalogModel,
);

export const grok42 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.2" as const, {
  ...GROK_BASE,
  name: "Grok 4.2",
  created: "2026-03-16",
  knowledge: "2024-11",
} satisfies CatalogModel);

export const grok42Reasoning = presetFor<CanonicalModelId, CatalogModel>()(
  "xai/grok-4.2-reasoning" as const,
  {
    ...GROK_REASONING_BASE,
    name: "Grok 4.2 Reasoning",
    created: "2026-03-16",
    knowledge: "2024-11",
  } satisfies CatalogModel,
);

export const grok42MultiAgent = presetFor<CanonicalModelId, CatalogModel>()(
  "xai/grok-4.2-multi-agent" as const,
  {
    ...GROK_REASONING_BASE,
    name: "Grok 4.2 Multi-Agent",
    created: "2026-03-16",
    knowledge: "2024-11",
  } satisfies CatalogModel,
);

const grokAtomic = {
  "v4.1": [grok41Fast, grok41FastReasoning],
  "v4.2": [grok42, grok42Reasoning, grok42MultiAgent],
} as const;

const grokGroups = {} as const;

export const grok = {
  ...grokAtomic,
  ...grokGroups,
  latest: [grok42, grok42Reasoning, grok42MultiAgent],
  all: Object.values(grokAtomic).flat(),
} as const;
