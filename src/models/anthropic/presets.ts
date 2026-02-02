import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const CLAUDE_BASE = {
  modalities: {
    input: ["text", "image", "pdf", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  context: 200000,
  providers: ["anthropic", "bedrock", "vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const claudeHaiku45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-haiku-4.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Haiku 4.5",
    created: "2025-10-15",
    knowledge: "2025-02",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-4.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Sonnet 4.5",
    created: "2025-09-29",
    knowledge: "2025-07",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 4.5",
    created: "2025-11-24",
    knowledge: "2025-05",
  } satisfies DeepPartial<CatalogModel>,
);

const claudeAtomic = {
  "v4.5": [claudeHaiku45, claudeSonnet45, claudeOpus45],
  haiku: [claudeHaiku45],
  sonnet: [claudeSonnet45],
  opus: [claudeOpus45],
} as const;

const claudeGroups = {
  "v4.x": [...claudeAtomic["v4.5"]],
} as const;

export const claude = {
  ...claudeAtomic,
  ...claudeGroups,
  latest: [...claudeAtomic["v4.5"]],
  all: Object.values(claudeAtomic).flat(),
} as const;
