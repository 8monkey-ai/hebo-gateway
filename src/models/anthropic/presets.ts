import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const CLAUDE_BASE = {
  modalities: {
    input: ["text", "image", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "structured_output", "temperature"],
  context: 200000,
  providers: ["anthropic", "bedrock", "vertex"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const CLAUDE_PDF_MODALITIES = {
  modalities: {
    input: ["text", "image", "pdf", "file"] as const,
    output: ["text"] as const,
  },
} satisfies DeepPartial<CatalogModel>;

export const claudeHaiku45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-haiku-4.5" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Haiku 4.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-10-01",
    knowledge: "2025-07",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeHaiku35 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-haiku-3.5" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Haiku 3.5",
    created: "2024-10-22",
    knowledge: "2024-07",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeHaiku3 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-haiku-3" as const,
  {
    ...CLAUDE_BASE,
    name: "Claude Haiku 3",
    created: "2024-03-07",
    knowledge: "2023-08",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-4.5" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Sonnet 4.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-09-29",
    knowledge: "2025-07",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet4 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-4" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Sonnet 4",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-05-14",
    knowledge: "2025-03",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet37 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-3.7" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Sonnet 3.7",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-02-19",
    knowledge: "2024-10",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeSonnet35 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-sonnet-3.5" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Sonnet 3.5",
    created: "2024-10-22",
    knowledge: "2024-04",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus45 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.5" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Opus 4.5",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-11-01",
    knowledge: "2025-05",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus46 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.6" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Opus 4.6",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2026-02-05",
    knowledge: "2025-05",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus41 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4.1" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Opus 4.1",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-08-05",
    knowledge: "2025-03",
  } satisfies DeepPartial<CatalogModel>,
);

export const claudeOpus4 = presetFor<CanonicalModelId, CatalogModel>()(
  "anthropic/claude-opus-4" as const,
  {
    ...CLAUDE_BASE,
    ...CLAUDE_PDF_MODALITIES,
    name: "Claude Opus 4",
    capabilities: [...CLAUDE_BASE.capabilities, "reasoning"],
    created: "2025-05-14",
    knowledge: "2025-03",
  } satisfies DeepPartial<CatalogModel>,
);

const claudeAtomic = {
  "v4.6": [claudeOpus46],
  "v4.5": [claudeHaiku45, claudeSonnet45, claudeOpus45],
  "v4.1": [claudeOpus41],
  v4: [claudeSonnet4, claudeOpus4],
  "v3.7": [claudeSonnet37],
  "v3.5": [claudeSonnet35, claudeHaiku35],
  v3: [claudeHaiku3],
  haiku: [claudeHaiku45, claudeHaiku35, claudeHaiku3],
  sonnet: [claudeSonnet45, claudeSonnet4, claudeSonnet37, claudeSonnet35],
  opus: [claudeOpus46, claudeOpus45, claudeOpus41, claudeOpus4],
} as const;

const claudeGroups = {
  "v4.x": [
    ...claudeAtomic["v4.6"],
    ...claudeAtomic["v4.5"],
    ...claudeAtomic["v4.1"],
    ...claudeAtomic["v4"],
  ],
  "v3.x": [...claudeAtomic["v3.7"], ...claudeAtomic["v3.5"], ...claudeAtomic["v3"]],
} as const;

export const claude = {
  ...claudeAtomic,
  ...claudeGroups,
  latest: [...claudeAtomic["v4.6"]],
  all: Object.values(claudeAtomic).flat(),
} as const;
