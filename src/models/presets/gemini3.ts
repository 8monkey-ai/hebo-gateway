import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

export const gemini3ProPreview = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3-pro-preview" as const,
  {
    name: "Gemini 3 Pro (Preview)",
    created: "2025-11-18",
    knowledge: "2025-01",
    modalities: {
      input: ["text", "image", "pdf", "file", "audio", "video"] as const,
      output: ["text"] as const,
    },
    context: 1048576,
    capabilities: [
      "attachments",
      "reasoning",
      "tool_call",
      "structured_output",
      "temperature",
    ] as const,
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini3FlashPreview = presetFor<CanonicalModelId, CatalogModel>()(
  "google/gemini-3-flash-preview" as const,
  {
    name: "Gemini 3 Flash",
    created: "2025-12-17",
    knowledge: "2025-01",
    modalities: {
      input: ["text", "image", "pdf", "file", "audio", "video"] as const,
      output: ["text"] as const,
    },
    context: 200000,
    capabilities: [
      "attachments",
      "reasoning",
      "tool_call",
      "structured_output",
      "temperature",
    ] as const,
  } satisfies DeepPartial<CatalogModel>,
);

export const gemini3 = [gemini3FlashPreview, gemini3ProPreview];
