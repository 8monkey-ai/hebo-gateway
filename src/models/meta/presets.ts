import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const LLAMA_3_BASE = {
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "temperature"] as const,
  context: 128000,
  providers: ["groq", "bedrock", "vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const llama31_8b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.1-8b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.1 8B",
    created: "2024-07-23",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama31_70b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.1-70b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.1 70B",
    created: "2024-07-23",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama31_405b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.1-405b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.1 405B",
    created: "2024-07-23",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama32_1b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.2-1b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.2 1B",
    created: "2024-09-25",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama32_3b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.2-3b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.2 3B",
    created: "2024-09-25",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama32_11b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.2-11b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.2 11B",
    created: "2024-09-25",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama32_90b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.2-90b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.2 90B",
    created: "2024-09-25",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

export const llama33_70b = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-3.3-70b" as const,
  {
    ...LLAMA_3_BASE,
    name: "Llama 3.3 70B",
    created: "2024-12-06",
    knowledge: "2023-12",
  } satisfies CatalogModel,
);

const LLAMA_4_BASE = {
  modalities: {
    input: ["text", "image", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "temperature"] as const,
  context: 1000000,
  providers: ["groq", "vertex", "bedrock"] as const,
} satisfies DeepPartial<CatalogModel>;

export const llama4Scout = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-4-scout" as const,
  {
    ...LLAMA_4_BASE,
    name: "Llama 4 Scout",
    created: "2025-08-05",
    knowledge: "2024-06",
  } satisfies CatalogModel,
);

export const llama4Maverick = presetFor<CanonicalModelId, CatalogModel>()(
  "meta/llama-4-maverick" as const,
  {
    ...LLAMA_4_BASE,
    name: "Llama 4 Maverick",
    created: "2025-08-05",
    knowledge: "2024-06",
  } satisfies CatalogModel,
);

const llamaAtomic = {
  "v3.1": [llama31_8b, llama31_70b, llama31_405b],
  "v3.2": [llama32_1b, llama32_3b, llama32_11b, llama32_90b],
  "v3.3": [llama33_70b],
  v4: [llama4Scout, llama4Maverick],
} as const;

const llamaGroups = {
  "v3.x": [...llamaAtomic["v3.1"], ...llamaAtomic["v3.2"], ...llamaAtomic["v3.3"]],
  "v4.x": [...llamaAtomic["v4"]],
} as const;

export const llama = {
  ...llamaAtomic,
  ...llamaGroups,
  latest: [...llamaAtomic["v4"]],
  all: Object.values(llamaAtomic).flat(),
} as const;
