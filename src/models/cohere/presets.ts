import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const COMMAND_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "structured_output", "reasoning", "temperature"] as const,
  providers: ["cohere"] as const satisfies readonly CanonicalProviderId[],
  knowledge: "2024-06",
} satisfies DeepPartial<CatalogModel>;

const COMMAND_VISION_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["structured_output", "reasoning", "temperature"] as const,
  providers: ["cohere"] as const satisfies readonly CanonicalProviderId[],
  knowledge: "2024-06",
} satisfies DeepPartial<CatalogModel>;

const EMBED_V3_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["embedding"] as const,
  },
  providers: ["cohere"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const EMBED_V4_BASE = {
  modalities: {
    input: ["text", "image", "pdf"] as const,
    output: ["embedding"] as const,
  },
  providers: ["cohere"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const commandA = presetFor<CanonicalModelId, CatalogModel>()("cohere/command-a" as const, {
  ...COMMAND_BASE,
  name: "Cohere Command A",
  created: "2025-03-13",
  context: 256000,
} satisfies CatalogModel);

export const commandAReasoning = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/command-a-reasoning" as const,
  {
    ...COMMAND_BASE,
    name: "Cohere Command A Reasoning",
    created: "2025-08-21",
    context: 256000,
  } satisfies CatalogModel,
);

export const commandATranslate = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/command-a-translate" as const,
  {
    ...COMMAND_BASE,
    name: "Cohere Command A Translate",
    created: "2025-08-28",
    context: 8000,
  } satisfies CatalogModel,
);

export const commandAVision = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/command-a-vision" as const,
  {
    ...COMMAND_VISION_BASE,
    name: "Cohere Command A Vision",
    created: "2025-07-31",
    context: 128000,
  } satisfies CatalogModel,
);

export const commandR = presetFor<CanonicalModelId, CatalogModel>()("cohere/command-r" as const, {
  ...COMMAND_BASE,
  name: "Cohere Command R",
  created: "2024-08-01",
  context: 128000,
  providers: ["cohere", "bedrock"],
} satisfies CatalogModel);

export const commandRPlus = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/command-r-plus" as const,
  {
    ...COMMAND_BASE,
    name: "Cohere Command R+",
    created: "2024-08-01",
    context: 128000,
    providers: ["cohere", "bedrock"],
  } satisfies CatalogModel,
);

export const commandR7b = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/command-r7b" as const,
  {
    ...COMMAND_BASE,
    name: "Cohere Command R7B",
    created: "2024-12-13",
    context: 128000,
  } satisfies CatalogModel,
);

export const embed4 = presetFor<CanonicalModelId, CatalogModel>()("cohere/embed-v4.0" as const, {
  ...EMBED_V4_BASE,
  name: "Cohere 4 Embeddings",
  created: "2025-04-15",
  context: 128000,
  providers: ["cohere", "bedrock"],
} satisfies CatalogModel);

export const embedEnglishV3 = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/embed-english-v3.0" as const,
  {
    ...EMBED_V3_BASE,
    name: "Cohere Embed English v3",
    created: "2024-02-07",
    context: 512,
    providers: ["cohere", "bedrock"],
  } satisfies CatalogModel,
);

export const embedEnglishLightV3 = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/embed-english-light-v3.0" as const,
  {
    ...EMBED_V3_BASE,
    name: "Cohere Embed English Light v3",
    created: "2024-02-07",
    context: 512,
    providers: ["cohere"],
  } satisfies CatalogModel,
);

export const embedMultilingualV3 = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/embed-multilingual-v3.0" as const,
  {
    ...EMBED_V3_BASE,
    name: "Cohere Embed Multilingual v3",
    created: "2024-02-07",
    context: 512,
    providers: ["cohere", "bedrock"],
  } satisfies CatalogModel,
);

export const embedMultilingualLightV3 = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/embed-multilingual-light-v3.0" as const,
  {
    ...EMBED_V3_BASE,
    name: "Cohere Embed Multilingual Light v3",
    created: "2024-02-07",
    context: 512,
    providers: ["cohere"],
  } satisfies CatalogModel,
);

const commandAtomic = {
  A: [commandA, commandAReasoning, commandATranslate, commandAVision],
  R: [commandR, commandRPlus, commandR7b],
} as const;

const commandGroups = {} as const;

export const command = {
  ...commandAtomic,
  ...commandGroups,
  latest: [commandA],
  all: Object.values(commandAtomic).flat(),
} as const;

const embedAtomic = {
  v4: [embed4],
  v3: [embedEnglishV3, embedEnglishLightV3, embedMultilingualV3, embedMultilingualLightV3],
} as const;

const embedGroups = {} as const;

export const embed = {
  ...embedAtomic,
  ...embedGroups,
  latest: [embed4],
  all: Object.values(embedAtomic).flat(),
} as const;
