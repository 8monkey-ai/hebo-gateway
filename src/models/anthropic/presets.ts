import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const CLAUDE_BASE = {
  modalities: {
    input: ["text", "image", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "structured_output", "temperature"],
  context: 200000,
  providers: [
    "anthropic",
    "bedrock",
    "vertex",
    "azure",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const claudeHaiku45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-haiku-4.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Haiku 4.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-10-01",
    knowledge: "2025-07",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeHaiku55 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-haiku-5.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Haiku 5.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-10-07",
    knowledge: "2026-06",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet55 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-5.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Sonnet 5.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-09-28",
    knowledge: "2026-06",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet5 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Sonnet 5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-06-29",
    knowledge: "2026-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet46 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-4.6" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Sonnet 4.6",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2026-02-17",
    knowledge: "2025-08",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 4.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-11-01",
    knowledge: "2025-05",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus55 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-5.5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 5.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-09-22",
    knowledge: "2026-06",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus5 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-07-24",
    knowledge: "2026-05",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus48 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.8" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 4.8",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-05-28",
    knowledge: "2026-02",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeFable51 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-fable-5.1" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Fable 5.1",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-09-01",
    knowledge: "2026-06",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeFable5 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-fable-5" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Fable 5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-06-09",
    knowledge: "2026-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus47 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.7" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 4.7",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    context: 1_000_000,
    created: "2026-04-16",
    knowledge: "2026-01",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus46 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.6" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Opus 4.6",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2026-02-05",
    knowledge: "2025-05",
  } satisfies DeepPartial<CatalogModel>,
);

const claudeAtomic = {
  "v5.5": [claudeOpus55, claudeSonnet55, claudeHaiku55],
  "v5.1": [claudeFable51],
  v5: [claudeOpus5, claudeSonnet5, claudeFable5],
  "v4.8": [claudeOpus48],
  "v4.7": [claudeOpus47],
  "v4.6": [claudeSonnet46, claudeOpus46],
  "v4.5": [claudeHaiku45, claudeOpus45],
  fable: [claudeFable51, claudeFable5],
  haiku: [claudeHaiku55, claudeHaiku45],
  sonnet: [claudeSonnet55, claudeSonnet5, claudeSonnet46],
  opus: [claudeOpus55, claudeOpus5, claudeOpus48, claudeOpus47, claudeOpus46, claudeOpus45],
} as const;

const claudeGroups = {
  "v5.x": [...claudeAtomic["v5.5"], ...claudeAtomic["v5.1"], ...claudeAtomic["v5"]],
  "v4.x": [
    ...claudeAtomic["v4.8"],
    ...claudeAtomic["v4.7"],
    ...claudeAtomic["v4.6"],
    ...claudeAtomic["v4.5"],
  ],
} as const;

export const claude = {
  ...claudeAtomic,
  ...claudeGroups,
  // Opus, Sonnet, Haiku and Fable move past 5.0 independently; Fable 5.1 is its newest.
  latest: [claudeOpus55, claudeSonnet55, claudeHaiku55, claudeFable51],
  all: Object.values(claudeAtomic).flat(),
} as const;
