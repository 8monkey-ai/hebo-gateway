import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const MINIMAX_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  context: 204800,
} satisfies DeepPartial<CatalogModel>;

export const minimaxM25 = presetFor<CanonicalModelId, CatalogModel>()("minimax/m2.5" as const, {
  ...MINIMAX_BASE,
  name: "MiniMax M2.5",
  created: "2026-02-12",
  providers: [
    "minimax",
    "togetherai",
    "deepinfra",
    "chutes",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

export const minimaxM27 = presetFor<CanonicalModelId, CatalogModel>()("minimax/m2.7" as const, {
  ...MINIMAX_BASE,
  name: "MiniMax M2.7",
  created: "2026-03-18",
  providers: [
    "minimax",
    "togetherai",
    "fireworks",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

export const minimaxM3 = presetFor<CanonicalModelId, CatalogModel>()("minimax/m3" as const, {
  ...MINIMAX_BASE,
  modalities: {
    input: ["text", "image", "video"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  context: 524288,
  name: "MiniMax M3",
  created: "2026-05-31",
  providers: [
    "minimax",
    "togetherai",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

const minimaxAtomic = {
  v2: [minimaxM25, minimaxM27],
  v3: [minimaxM3],
} as const;

const minimaxGroups = {
  "v2.x": [...minimaxAtomic["v2"]],
  "v3.x": [...minimaxAtomic["v3"]],
} as const;

export const minimax = {
  ...minimaxAtomic,
  ...minimaxGroups,
  latest: [minimaxM3],
  all: Object.values(minimaxAtomic).flat(),
} as const;
