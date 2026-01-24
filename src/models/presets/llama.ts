import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const LLAMA_3_BASE = {
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "temperature"] as const,
  context: 128000,
  providers: ["groq", "bedrock", "vertex"] as const,
} satisfies DeepPartial<CatalogModel>;

export const llama31_8b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.1-8b" as const,
  {
    name: "Llama 3.1 8B",
    created: "2024-07-23",
    knowledge: "2023-12",
    ...LLAMA_3_BASE,
  } satisfies CatalogModel,
);

export const llama33_70b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.3-70b" as const,
  {
    name: "Llama 3.3 70b",
    created: "2024-12-06",
    knowledge: "2023-12",
    ...LLAMA_3_BASE,
  } satisfies CatalogModel,
);

export const LLAMA_4_BASE = {
  modalities: {
    input: ["text", "image", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "temperature"] as const,
  context: 1000000,
  providers: ["groq"] as const,
} satisfies DeepPartial<CatalogModel>;

export const llama4Scout = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-4-scout" as const,
  {
    name: "Llama 4 Scout",
    created: "2025-08-05",
    knowledge: "2024-06",
    ...LLAMA_4_BASE,
  } satisfies CatalogModel,
);

export const llama4Maverick = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-4-maverick" as const,
  {
    name: "Llama 4 Maverick",
    created: "2025-08-05",
    knowledge: "2024-06",
    ...LLAMA_4_BASE,
  } satisfies CatalogModel,
);

const llamaAtomic = {
  v3_1: [llama31_8b],
  v3_3: [llama33_70b],
  v4: [llama4Scout, llama4Maverick],
} as const;

const llamaGroups = {
  v3_x: [llama31_8b, llama33_70b],
  v4_x: [llama4Scout, llama4Maverick],
} as const;

export const llama = {
  ...llamaAtomic,
  ...llamaGroups,
  latest: [...llamaAtomic.v4],
  all: Object.values(llamaAtomic).flat(),
} as const;
