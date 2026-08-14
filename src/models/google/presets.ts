import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const GEMINI_BASE = {
  modalities: {
    input: ["text", "image", "pdf", "file", "audio", "video"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  context: 1048576,
  providers: ["vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

// Gemini 3.x models manage sampling internally on Vertex; custom temperature,
// top-K, and top-P values are ignored, so we drop the `temperature` capability.
const GEMINI_3X_BASE = {
  ...GEMINI_BASE,
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output"] as const,
} satisfies DeepPartial<CatalogModel>;

const GEMINI_EMBEDDINGS_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embedding"] as const,
  },
  providers: ["vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const geminiEmbedding001 = presetFor<CanonicalModelId, CatalogModel>()(
  "google/embedding-001" as const,
  {
    ...GEMINI_EMBEDDINGS_BASE,
    name: "Gemini Embedding 001",
    created: "2025-05-20",
    context: 8192,
  } satisfies CatalogModel,
);

export const geminiEmbedding2 = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-embedding-2" as const,
  {
    ...GEMINI_EMBEDDINGS_BASE,
    modalities: {
      input: ["text", "image", "video", "audio", "pdf"] as const,
      output: ["embedding"] as const,
    },
    name: "Gemini Embedding 2",
    created: "2026-04-23",
    context: 8192,
  } satisfies CatalogModel,
);

export const gemini3FlashPreview = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3-flash-preview" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3 Flash (Preview)",
    created: "2025-12-17",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini31FlashLite = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3.1-flash-lite" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3.1 Flash-Lite",
    created: "2026-03-03",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini31ProPreview = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3.1-pro-preview" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3.1 Pro (Preview)",
    created: "2026-02-19",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini37Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3.7-flash" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3.7 Flash",
    created: "2026-08-13",
    knowledge: "2026-03",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini36Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3.6-flash" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3.6 Flash",
    created: "2026-07-21",
    knowledge: "2026-03",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini35FlashLite = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3.5-flash-lite" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3.5 Flash-Lite",
    created: "2026-07-21",
    knowledge: "2026-03",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini35Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3.5-flash" as const,
  {
    ...GEMINI_3X_BASE,
    name: "Gemini 3.5 Flash",
    created: "2026-05-19",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini25FlashLite = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-2.5-flash-lite" as const,
  {
    ...GEMINI_BASE,
    name: "Gemini 2.5 Flash Lite",
    created: "2025-06-17",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini25Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-2.5-flash" as const,
  {
    ...GEMINI_BASE,
    name: "Gemini 2.5 Flash",
    created: "2025-03-20",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini25Pro = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-2.5-pro" as const,
  {
    ...GEMINI_BASE,
    name: "Gemini 2.5 Pro",
    created: "2025-03-20",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

// ---------------------------------------------------------------------------
// Gemma
// ---------------------------------------------------------------------------

const GEMMA3_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "structured_output", "temperature"] as const,
  context: 131072,
  knowledge: "2025-01",
  providers: ["vertex", "bedrock", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const GEMMA4_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "structured_output", "temperature"] as const,
  context: 131072,
  knowledge: "2025-01",
  providers: ["vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const gemma31b = presetFor<CanonicalModelId, CatalogModel>()("google/gemma-3-1b" as const, {
  ...GEMMA3_BASE,
  name: "Gemma 3 1B",
  created: "2025-03-12",
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  context: 32768,
  providers: ["vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

export const gemma34b = presetFor<CanonicalModelId, CatalogModel>()("google/gemma-3-4b" as const, {
  ...GEMMA3_BASE,
  name: "Gemma 3 4B",
  created: "2025-03-12",
} satisfies DeepPartial<CatalogModel>);

export const gemma312b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-3-12b" as const,
  {
    ...GEMMA3_BASE,
    name: "Gemma 3 12B",
    created: "2025-03-12",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemma327b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-3-27b" as const,
  {
    ...GEMMA3_BASE,
    name: "Gemma 3 27B",
    created: "2025-03-12",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemma4E2b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-4-e2b" as const,
  {
    ...GEMMA4_BASE,
    name: "Gemma 4 E2B",
    created: "2026-04-02",
    modalities: {
      input: ["text", "image", "audio"] as const,
      output: ["text"] as const,
    },
  } satisfies CatalogModel,
);

export const gemma4E4b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-4-e4b" as const,
  {
    ...GEMMA4_BASE,
    name: "Gemma 4 E4B",
    created: "2026-04-02",
    modalities: {
      input: ["text", "image", "audio"] as const,
      output: ["text"] as const,
    },
  } satisfies CatalogModel,
);

export const gemma426bA4b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-4-26b-a4b" as const,
  {
    ...GEMMA4_BASE,
    name: "Gemma 4 26B-A4B",
    created: "2026-04-02",
    capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
    context: 262144,
    providers: ["vertex", "deepinfra"] as const satisfies readonly CanonicalProviderId[],
  } satisfies CatalogModel,
);

export const gemma431b = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemma-4-31b" as const,
  {
    ...GEMMA4_BASE,
    name: "Gemma 4 31B",
    created: "2026-04-02",
    context: 262144,
    providers: [
      "vertex",
      "deepinfra",
      "togetherai",
    ] as const satisfies readonly CanonicalProviderId[],
  } satisfies CatalogModel,
);

const gemmaAtomic = {
  v3: [gemma31b, gemma34b, gemma312b, gemma327b],
  v4: [gemma4E2b, gemma4E4b, gemma426bA4b, gemma431b],
} as const;

const gemmaGroups = {
  "v3.x": [...gemmaAtomic["v3"]],
  "v4.x": [...gemmaAtomic["v4"]],
} as const;

export const gemma = {
  ...gemmaAtomic,
  ...gemmaGroups,
  latest: [...gemmaAtomic["v4"]],
  all: Object.values(gemmaAtomic).flat(),
} as const;

// ---------------------------------------------------------------------------
// Gemini groups
// ---------------------------------------------------------------------------

const geminiAtomic = {
  "v2.5": [gemini25FlashLite, gemini25Flash, gemini25Pro],
  "v3.1": [gemini31FlashLite],
  "v3.5": [gemini35FlashLite, gemini35Flash],
  "v3.6": [gemini36Flash],
  "v3.7": [gemini37Flash],
  "v3-preview": [gemini3FlashPreview, gemini31ProPreview],
  embeddings: [geminiEmbedding001, geminiEmbedding2],
} as const;

const geminiGroups = {
  "v2.x": [...geminiAtomic["v2.5"]],
  "v3.x": [
    ...geminiAtomic["v3-preview"],
    ...geminiAtomic["v3.1"],
    ...geminiAtomic["v3.5"],
    ...geminiAtomic["v3.6"],
    ...geminiAtomic["v3.7"],
  ],
} as const;

export const gemini = {
  ...geminiAtomic,
  ...geminiGroups,
  latest: [...geminiAtomic["v3.7"]],
  preview: [...geminiAtomic["v3-preview"]],
  embeddings: [...geminiAtomic["embeddings"]],
  all: Object.values(geminiAtomic).flat(),
} as const;
