import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const GPT_OSS_BASE = {
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  context: 131072,
  providers: ["groq", "bedrock", "vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const GPT_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  providers: ["openai", "azure"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const GPT_PRO_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  providers: ["openai", "azure"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const EMBEDDINGS_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embeddings"] as const,
  },
  providers: ["openai", "azure"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const gpt5 = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5" as const, {
  ...GPT_BASE,
  name: "GPT-5",
  created: "2025-08-07",
  knowledge: "2024-09",
  context: 400000,
} satisfies CatalogModel);

export const gpt5Pro = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5-pro" as const, {
  ...GPT_PRO_BASE,
  name: "GPT-5 Pro",
  created: "2025-10-06",
  knowledge: "2024-09",
  context: 400000,
} satisfies CatalogModel);

export const gpt5Mini = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5-mini" as const, {
  ...GPT_BASE,
  name: "GPT-5 Mini",
  created: "2025-08-07",
  knowledge: "2024-05",
  context: 400000,
} satisfies CatalogModel);

export const gpt5Nano = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5-nano" as const, {
  ...GPT_BASE,
  name: "GPT-5 Nano",
  created: "2025-08-07",
  knowledge: "2024-05",
  context: 400000,
} satisfies CatalogModel);

export const gpt51 = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5.1" as const, {
  ...GPT_BASE,
  name: "GPT-5.1",
  created: "2025-11-13",
  knowledge: "2024-09",
  context: 400000,
} satisfies CatalogModel);

export const gpt51Chat = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5.1-chat" as const,
  {
    ...GPT_BASE,
    name: "GPT-5.1 Chat",
    created: "2025-11-13",
    knowledge: "2024-09",
    context: 128000,
  } satisfies CatalogModel,
);

export const gpt51Codex = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5.1-codex" as const,
  {
    ...GPT_BASE,
    name: "GPT-5.1 Codex",
    created: "2025-11-13",
    knowledge: "2024-09",
    context: 400000,
  } satisfies CatalogModel,
);

export const gpt51CodexMax = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5.1-codex-max" as const,
  {
    ...GPT_BASE,
    name: "GPT-5.1 Codex Max",
    created: "2025-11-19",
    knowledge: "2024-09",
    context: 400000,
  } satisfies CatalogModel,
);

export const gpt5Codex = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5-codex" as const,
  {
    ...GPT_BASE,
    name: "GPT-5 Codex",
    created: "2025-09-15",
    knowledge: "2024-09",
    context: 400000,
  } satisfies CatalogModel,
);

export const gpt52 = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5.2" as const, {
  ...GPT_BASE,
  name: "GPT-5.2",
  created: "2025-12-11",
  knowledge: "2025-08",
  context: 400000,
} satisfies CatalogModel);

export const gpt52Chat = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5.2-chat" as const,
  {
    ...GPT_BASE,
    name: "GPT-5.2 Chat",
    created: "2025-12-11",
    knowledge: "2025-08",
    context: 128000,
  } satisfies CatalogModel,
);

export const gpt52Pro = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-5.2-pro" as const, {
  ...GPT_PRO_BASE,
  name: "GPT-5.2 Pro",
  created: "2025-12-11",
  knowledge: "2025-08",
  context: 400000,
} satisfies CatalogModel);

export const gpt52Codex = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5.2-codex" as const,
  {
    ...GPT_BASE,
    name: "GPT-5.2 Codex",
    created: "2025-12-18",
    knowledge: "2025-08",
  } satisfies CatalogModel,
);

export const gpt53Codex = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-5.3-codex" as const,
  {
    ...GPT_BASE,
    name: "GPT-5.3 Codex",
    created: "2026-02-05",
    knowledge: "2025-08",
  } satisfies CatalogModel,
);

export const textEmbedding3Small = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/text-embedding-3-small" as const,
  {
    ...EMBEDDINGS_BASE,
    name: "Text Embedding 3 Small",
    created: "2024-01-25",
    context: 8192,
  } satisfies CatalogModel,
);

export const textEmbedding3Large = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/text-embedding-3-large" as const,
  {
    ...EMBEDDINGS_BASE,
    name: "Text Embedding 3 Large",
    created: "2024-01-25",
    context: 8192,
  } satisfies CatalogModel,
);

export const gptOss20b = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-oss-20b" as const,
  {
    ...GPT_OSS_BASE,
    name: "GPT-OSS 20B",
    created: "2025-08-05",
    knowledge: "2024-06",
  } satisfies CatalogModel,
);

export const gptOss120b = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-oss-120b" as const,
  {
    ...GPT_OSS_BASE,
    name: "GPT-OSS 120B",
    created: "2025-08-05",
    knowledge: "2024-06",
  } satisfies CatalogModel,
);

const gptOssAtomic = {
  v1: [gptOss20b, gptOss120b],
} as const;

const gptOssGroups = {
  "v1.x": [...gptOssAtomic["v1"]],
} as const;

const gptAtomic = {
  v5: [gpt5, gpt5Mini, gpt5Nano, gpt5Pro],
  "v5.1": [gpt51, gpt51Chat, gpt51Codex, gpt51CodexMax],
  "v5.2": [gpt52, gpt52Chat, gpt52Pro, gpt52Codex],
  "v5.3": [gpt53Codex],
  codex: [gpt5Codex, gpt51Codex, gpt51CodexMax, gpt52Codex, gpt53Codex],
  chat: [gpt51Chat, gpt52Chat],
  pro: [gpt5Pro, gpt52Pro],
} as const;

const gptGroups = {
  "v5.x": [...gptAtomic["v5"], ...gptAtomic["v5.1"], ...gptAtomic["v5.2"], ...gptAtomic["v5.3"]],
} as const;

const textEmbeddingsAtomic = {
  v3: [textEmbedding3Small, textEmbedding3Large],
} as const;

const textEmbeddingsGroups = {
  "v3.x": [...textEmbeddingsAtomic["v3"]],
} as const;

export const gptOss = {
  ...gptOssAtomic,
  ...gptOssGroups,
  latest: [...gptOssAtomic["v1"]],
  all: Object.values(gptOssAtomic).flat(),
} as const;

export const gpt = {
  ...gptAtomic,
  ...gptGroups,
  latest: [gpt52, gpt5Mini, gpt5Nano],
  all: Object.values(gptAtomic).flat(),
} as const;

export const textEmbeddings = {
  ...textEmbeddingsAtomic,
  ...textEmbeddingsGroups,
  latest: [...textEmbeddingsAtomic["v3"]],
  all: Object.values(textEmbeddingsAtomic).flat(),
} as const;
