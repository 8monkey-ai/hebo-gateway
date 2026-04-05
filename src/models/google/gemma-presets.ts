import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const GEMMA_3_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "temperature"] as const,
  context: 131072,
  providers: ["vertex", "groq"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const GEMMA_2_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["temperature"] as const,
  context: 8192,
  providers: ["vertex", "groq"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

// --- Gemma 3 ---

export const gemma3_1b = presetFor<CanonicalModelId, CatalogModel>()("google/gemma-3-1b" as const, {
  ...GEMMA_3_BASE,
  name: "Gemma 3 1B",
  created: "2025-03-12",
  knowledge: "2024-09",
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["temperature"] as const,
  context: 32768,
} satisfies CatalogModel);

export const gemma3_4b = presetFor<CanonicalModelId, CatalogModel>()("google/gemma-3-4b" as const, {
  ...GEMMA_3_BASE,
  name: "Gemma 3 4B",
  created: "2025-03-12",
  knowledge: "2024-09",
} satisfies CatalogModel);

export const gemma3_12b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-3-12b" as const,
  {
    ...GEMMA_3_BASE,
    name: "Gemma 3 12B",
    created: "2025-03-12",
    knowledge: "2024-09",
  } satisfies CatalogModel,
);

export const gemma3_27b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-3-27b" as const,
  {
    ...GEMMA_3_BASE,
    name: "Gemma 3 27B",
    created: "2025-03-12",
    knowledge: "2024-09",
  } satisfies CatalogModel,
);

// --- Gemma 2 ---

export const gemma2_2b = presetFor<CanonicalModelId, CatalogModel>()("google/gemma-2-2b" as const, {
  ...GEMMA_2_BASE,
  name: "Gemma 2 2B",
  created: "2024-06-27",
  knowledge: "2024-03",
} satisfies CatalogModel);

export const gemma2_9b = presetFor<CanonicalModelId, CatalogModel>()("google/gemma-2-9b" as const, {
  ...GEMMA_2_BASE,
  name: "Gemma 2 9B",
  created: "2024-06-27",
  knowledge: "2024-03",
} satisfies CatalogModel);

export const gemma2_27b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-2-27b" as const,
  {
    ...GEMMA_2_BASE,
    name: "Gemma 2 27B",
    created: "2024-06-27",
    knowledge: "2024-03",
  } satisfies CatalogModel,
);

const gemmaAtomic = {
  v3: [gemma3_1b, gemma3_4b, gemma3_12b, gemma3_27b],
  v2: [gemma2_2b, gemma2_9b, gemma2_27b],
} as const;

export const gemma = {
  ...gemmaAtomic,
  latest: [...gemmaAtomic["v3"]],
  all: Object.values(gemmaAtomic).flat(),
} as const;
