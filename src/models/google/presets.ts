import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

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

const GEMINI_EMBEDDINGS_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embeddings"] as const,
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

export const gemini3FlashPreview = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3-flash-preview" as const,
  {
    ...GEMINI_BASE,
    name: "Gemini 3 Flash (Preview)",
    created: "2025-12-17",
    knowledge: "2025-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini3ProPreview = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3-pro-preview" as const,
  {
    ...GEMINI_BASE,
    name: "Gemini 3 Pro (Preview)",
    created: "2025-11-18",
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

const geminiAtomic = {
  "v2.5": [gemini25FlashLite, gemini25Flash, gemini25Pro],
  "v3-preview": [gemini3FlashPreview, gemini3ProPreview],
  embeddings: [geminiEmbedding001],
} as const;

const geminiGroups = {
  "v2.x": [...geminiAtomic["v2.5"]],
  "v3.x": [...geminiAtomic["v3-preview"]],
} as const;

export const gemini = {
  ...geminiAtomic,
  ...geminiGroups,
  latest: [...geminiAtomic["v2.5"]],
  preview: [...geminiAtomic["v3-preview"]],
  embeddings: [...geminiAtomic["embeddings"]],
  all: Object.values(geminiAtomic).flat(),
} as const;
