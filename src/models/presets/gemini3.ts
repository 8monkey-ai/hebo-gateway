import type { CanonicalModelId, CatalogModel, CatalogModelCore } from "../types";

import { presetFor, presetGroup, type DeepPartial } from "../../utils/preset";

export const gemini3ProPreview = presetFor<CanonicalModelId, CatalogModelCore>()(
  "google/gemini-3-pro-preview",
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

export const gemini3FlashPreview = presetFor<CanonicalModelId, CatalogModelCore>()(
  "google/gemini-3-flash-preview",
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
  } satisfies DeepPartial<CatalogModelCore>,
);

export const gemini3Preview = presetGroup<CanonicalModelId, CatalogModelCore>()(
  gemini3FlashPreview,
  gemini3ProPreview,
);
