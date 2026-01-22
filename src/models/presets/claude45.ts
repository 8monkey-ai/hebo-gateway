import type { CanonicalModelId, CatalogModelCore, ModelId } from "../types";

import { presetFor, presetGroup, type DeepPartial } from "../../utils/preset";

export const claudeHaiku45 = presetFor<CanonicalModelId, CatalogModelCore>()(
  "anthropic/claude-haiku-4.5",
  {
    name: "Claude Haiku 4.5",
    created: "2025-10-15",
    knowledge: "2025-02",
    modalities: {
      input: ["text", "image", "pdf", "file"] as const,
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

export const claudeSonnet45 = presetFor<CanonicalModelId, CatalogModelCore>()(
  "anthropic/claude-sonnet-4.5",
  {
    name: "Claude Sonnet 4.5",
    created: "2025-09-29",
    knowledge: "2025-07",
    modalities: {
      input: ["text", "image", "pdf", "file"] as const,
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

export const claudeOpus45 = presetFor<CanonicalModelId, CatalogModelCore>()(
  "anthropic/claude-opus-4.5",
  {
    name: "Claude Opus 4.5",
    created: "2025-11-24",
    knowledge: "2025-05",
    modalities: {
      input: ["text", "image", "pdf", "file"] as const,
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

export const claude45 = presetGroup<ModelId, CatalogModelCore>()(
  claudeHaiku45,
  claudeSonnet45,
  claudeOpus45,
);
