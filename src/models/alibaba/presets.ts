import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

export const qwen35Plus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-plus" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 Plus",
    context: 1048576,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-flash" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 Flash",
    context: 1048576,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_397b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-397b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: [
      "alibaba",
      "chutes",
      "deepinfra",
      "togetherai",
      "fireworks",
    ] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 397B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_122b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-122b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba", "azure", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 122B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_35b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-35b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: [
      "alibaba",
      "azure",
      "deepinfra",
      "fireworks",
    ] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 35B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_27b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-27b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: [
      "alibaba",
      "azure",
      "deepinfra",
      "fireworks",
    ] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 27B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_9b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-9b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: [
      "alibaba",
      "azure",
      "deepinfra",
      "togetherai",
      "fireworks",
    ] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 9B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_4b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-4b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba", "azure", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 4B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_2b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-2b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba", "azure", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 2B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_08b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-0.8b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba", "azure", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.5 0.8B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen36Plus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.6-plus" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.6 Plus",
    context: 1048576,
    created: "2026-04-02",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen36Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.6-flash" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba", "azure", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.6 Flash",
    context: 262144,
    created: "2026-04-02",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen36_27b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.6-27b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.6 27B",
    context: 262144,
    created: "2026-04-21",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen37Plus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.7-plus" as const,
  {
    modalities: {
      input: ["text", "image", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.7 Plus",
    context: 1_000_000,
    created: "2026-06-02",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen37Max = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.7-max" as const,
  {
    modalities: {
      input: ["text"] as const,
      output: ["text"] as const,
    },
    capabilities: ["reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.7 Max",
    context: 1_000_000,
    created: "2026-05-21",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

const QWEN38_BASE = {
  modalities: {
    input: ["text", "image", "video", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  context: 1_000_000,
  providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const qwen38Max = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.8-max" as const,
  {
    ...QWEN38_BASE,
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.8 Max",
    created: "2026-08-03",
  } satisfies CatalogModel,
);

export const qwen38MaxPrime = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.8-max-prime" as const,
  {
    ...QWEN38_BASE,
    name: "Qwen3.8 Max Prime",
    created: "2026-09-23",
  } satisfies CatalogModel,
);

export const qwen38Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.8-flash" as const,
  {
    ...QWEN38_BASE,
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.8 Flash",
    created: "2026-08-26",
  } satisfies CatalogModel,
);

export const qwen38OmniFlash = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.8-omni-flash" as const,
  {
    ...QWEN38_BASE,
    modalities: {
      input: ["text", "image", "audio", "video", "file"] as const,
      output: ["text"] as const,
    },
    name: "Qwen3.8 Omni Flash",
    created: "2026-09-17",
  } satisfies CatalogModel,
);

export const qwen38_24t = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.8-2.4t" as const,
  {
    ...QWEN38_BASE,
    modalities: {
      input: ["text"] as const,
      output: ["text"] as const,
    },
    capabilities: ["reasoning", "tool_call", "structured_output", "temperature"],
    providers: [
      "alibaba",
      "deepinfra",
      "togetherai",
    ] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.8 2.4T",
    context: 1_048_576,
    created: "2026-08-12",
  } satisfies CatalogModel,
);

export const qwen38_27b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.8-27b" as const,
  {
    ...QWEN38_BASE,
    providers: [
      "alibaba",
      "groq",
      "chutes",
      "deepinfra",
    ] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.8 27B",
    context: 262144,
    created: "2026-08-14",
  } satisfies CatalogModel,
);

const QWEN3_EMBEDDING_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embeddings"] as const,
  },
  context: 32768,
  providers: ["alibaba", "azure", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const qwen3Embedding06b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-embedding-0.6b" as const,
  {
    ...QWEN3_EMBEDDING_BASE,
    name: "Qwen3 Embedding 0.6B",
    created: "2025-06-05",
  } satisfies CatalogModel,
);

export const qwen3Embedding4b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-embedding-4b" as const,
  {
    ...QWEN3_EMBEDDING_BASE,
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3 Embedding 4B",
    created: "2025-06-05",
  } satisfies CatalogModel,
);

export const qwen3Embedding8b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-embedding-8b" as const,
  {
    ...QWEN3_EMBEDDING_BASE,
    name: "Qwen3 Embedding 8B",
    created: "2025-06-05",
  } satisfies CatalogModel,
);

const qwenAtomic = {
  "v3.5": [
    qwen35Plus,
    qwen35Flash,
    qwen35_397b,
    qwen35_122b,
    qwen35_35b,
    qwen35_27b,
    qwen35_9b,
    qwen35_4b,
    qwen35_2b,
    qwen35_08b,
  ],
  "v3.6": [qwen36Plus, qwen36Flash, qwen36_27b],
  "v3.7": [qwen37Plus, qwen37Max],
  "v3.8": [qwen38Max, qwen38MaxPrime, qwen38Flash, qwen38OmniFlash, qwen38_24t, qwen38_27b],
  embedding: [qwen3Embedding06b, qwen3Embedding4b, qwen3Embedding8b],
} as const;

const qwenGroups = {
  "v3.x": [
    ...qwenAtomic["v3.5"],
    ...qwenAtomic["v3.6"],
    ...qwenAtomic["v3.7"],
    ...qwenAtomic["v3.8"],
  ],
  embeddings: [...qwenAtomic["embedding"]],
} as const;

export const qwen = {
  ...qwenAtomic,
  ...qwenGroups,
  latest: [...qwenAtomic["v3.8"]],
  all: Object.values(qwenAtomic).flat(),
} as const;
