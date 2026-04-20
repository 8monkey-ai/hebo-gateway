import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const QWEN3_BASE = {
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  context: 131072,
  providers: ["alibaba", "bedrock", "vertex", "deepinfra", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const QWEN3_VL_BASE = {
  modalities: {
    input: ["text", "image", "video", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  context: 262144,
  providers: [
    "alibaba",
    "bedrock",
    "vertex",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const qwen3_235b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-235b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 235B",
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3_32b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-32b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 32B",
    providers: ["alibaba", "groq", "bedrock", "vertex", "chutes", "deepinfra", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

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
    providers: ["alibaba", "chutes", "deepinfra", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra", "fireworks"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra", "fireworks"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
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
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
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

export const qwen36_35bA3b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.6-35b-a3b" as const,
  {
    modalities: {
      input: ["text", "image", "video", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3.6 35B A3B",
    context: 262144,
    created: "2026-04-02",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3CoderNext = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-coder-next" as const,
  {
    modalities: {
      input: ["text", "file"] as const,
      output: ["text"] as const,
    },
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    name: "Qwen3 Coder Next",
    context: 131072,
    created: "2026-03-15",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3Vl235b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-vl-235b" as const,
  {
    ...QWEN3_VL_BASE,
    name: "Qwen3 VL 235B",
    created: "2025-09-23",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

const QWEN3_EMBEDDING_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embedding"] as const,
  },
  context: 32768,
  providers: ["alibaba", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
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
  v3: [qwen3_235b, qwen3_32b],
  "v3.5": [qwen35Plus, qwen35Flash, qwen35_397b, qwen35_122b, qwen35_35b, qwen35_27b, qwen35_9b, qwen35_4b, qwen35_2b, qwen35_08b],
  "v3.6": [qwen36Plus, qwen36_35bA3b],
  coder: [qwen3CoderNext],
  vl: [qwen3Vl235b],
  embedding: [qwen3Embedding06b, qwen3Embedding4b, qwen3Embedding8b],
} as const;

const qwenGroups = {
  "v3.x": [...qwenAtomic["v3"], ...qwenAtomic["v3.5"], ...qwenAtomic["v3.6"]],
  embeddings: [...qwenAtomic["embedding"]],
} as const;

export const qwen = {
  ...qwenAtomic,
  ...qwenGroups,
  latest: [...qwenAtomic["v3.6"]],
  all: Object.values(qwenAtomic).flat(),
} as const;
