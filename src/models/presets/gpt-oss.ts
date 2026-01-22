import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, presetGroup, type DeepPartial } from "../../utils/preset";

export const gptOss20b = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-oss-20b", {
  name: "GPT-OSS 20B",
  created: "2025-08-05",
  knowledge: "2024-06",
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  context: 131072,
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
} satisfies DeepPartial<CatalogModel>);

export const gptOss120b = presetFor<CanonicalModelId, CatalogModel>()("openai/gpt-oss-120b", {
  name: "GPT-OSS 120B",
  created: "2025-08-05",
  knowledge: "2024-06",
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  context: 131072,
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
} satisfies DeepPartial<CatalogModel>);

export const gptOss = presetGroup<CanonicalModelId, CatalogModel>()(gptOss20b, gptOss120b);
