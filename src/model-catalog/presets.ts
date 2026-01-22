import { presetFor, type DeepPartial } from "#/utils/preset";

import type { CanonicalModelId, CatalogModel } from "./types";

export const claudeSonnet45 = presetFor<CatalogModel, CanonicalModelId>()(
  "anthropic/claude-sonnet-4.5",
  {
    name: "Claude Sonnet 4.5",
    created: "2025-09-29",
    knowledge: "2025-07",
    modalities: {
      input: ["text", "image", "pdf", "audio", "video"] as const,
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

export const claudeOpus45 = presetFor<CatalogModel, CanonicalModelId>()(
  "anthropic/claude-opus-4.5",
  {
    name: "Claude Opus 4.5",
    created: "2025-11-24",
    knowledge: "2025-05",
    modalities: {
      input: ["text", "image", "pdf", "audio", "video"] as const,
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
