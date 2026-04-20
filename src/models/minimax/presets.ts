import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const MINIMAX_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: [
    "attachments",
    "reasoning",
    "tool_call",
    "structured_output",
    "temperature",
  ] as const,
  context: 1048576,
  providers: [
    "minimax",
    "togetherai",
    "deepinfra",
    "fireworks",
    "chutes",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const minimaxM25 = presetFor<CanonicalModelId, CatalogModel>()("minimax/m2.5" as const, {
  ...MINIMAX_BASE,
  name: "MiniMax M2.5",
  created: "2025-06-30",
  knowledge: "2025-06",
} satisfies CatalogModel);

export const minimaxM27 = presetFor<CanonicalModelId, CatalogModel>()("minimax/m2.7" as const, {
  ...MINIMAX_BASE,
  name: "MiniMax M2.7",
  created: "2025-07-17",
  knowledge: "2025-06",
} satisfies CatalogModel);

const minimaxAtomic = {
  v2: [minimaxM25, minimaxM27],
} as const;

const minimaxGroups = {
  "v2.x": [...minimaxAtomic["v2"]],
} as const;

export const minimax = {
  ...minimaxAtomic,
  ...minimaxGroups,
  latest: [minimaxM27],
  all: Object.values(minimaxAtomic).flat(),
} as const;
