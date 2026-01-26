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

export const gptOss20b = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-oss-20b" as const,
  {
    name: "GPT-OSS 20B",
    created: "2025-08-05",
    knowledge: "2024-06",
    ...GPT_OSS_BASE,
  } satisfies CatalogModel,
);

export const gptOss120b = presetFor<CanonicalModelId, CatalogModel>()(
  "openai/gpt-oss-120b" as const,
  {
    name: "GPT-OSS 120B",
    created: "2025-08-05",
    knowledge: "2024-06",
    ...GPT_OSS_BASE,
  } satisfies CatalogModel,
);

const gptOssAtomic = {
  v1: [gptOss20b, gptOss120b],
} as const;

const gptOssGroups = {
  "v1.x": [...gptOssAtomic["v1"]],
} as const;

export const gptOss = {
  ...gptOssAtomic,
  ...gptOssGroups,
  latest: [...gptOssAtomic["v1"]],
  all: Object.values(gptOssAtomic).flat(),
} as const;
