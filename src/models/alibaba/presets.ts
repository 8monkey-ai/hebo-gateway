import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const QWEN3_BASE = {
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  context: 131072,
  providers: ["alibaba", "bedrock", "vertex", "azure"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const QWEN3_ALIBABA_ONLY = {
  modalities: {
    input: ["text", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const QWEN3_VL_BASE = {
  modalities: {
    input: ["text", "image", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
  context: 131072,
  providers: [
    "alibaba",
    "bedrock",
    "vertex",
  ] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const qwen3_235b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-235b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 235B",
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3_32b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-32b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 32B",
    providers: ["alibaba", "groq", "bedrock", "vertex", "azure"] as const satisfies readonly CanonicalProviderId[],
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3_14b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-14b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 14B",
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3_8b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-8b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 8B",
    providers: ["alibaba"] as const satisfies readonly CanonicalProviderId[],
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3Max = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-max" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3 Max",
    context: 262144,
    created: "2025-09-23",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35Plus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-plus" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3.5 Plus",
    context: 1048576,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen35_397b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.5-397b" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3.5 397B",
    context: 262144,
    created: "2026-02-16",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen36Plus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.6-plus" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3.6 Plus",
    context: 1048576,
    created: "2026-04-02",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen36Flash = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3.6-flash" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3.6 Flash",
    context: 1048576,
    created: "2026-04-02",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3CoderPlus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-coder-plus" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3 Coder Plus",
    context: 1048576,
    created: "2025-07-23",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3CoderFlash = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-coder-flash" as const,
  {
    ...QWEN3_ALIBABA_ONLY,
    name: "Qwen3 Coder Flash",
    context: 1048576,
    created: "2025-07-23",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3Coder480b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-coder-480b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 Coder 480B",
    providers: [
      "alibaba",
      "bedrock",
    ] as const satisfies readonly CanonicalProviderId[],
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3Coder30b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-coder-30b" as const,
  {
    ...QWEN3_BASE,
    name: "Qwen3 Coder 30B",
    providers: [
      "alibaba",
      "bedrock",
    ] as const satisfies readonly CanonicalProviderId[],
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3VlPlus = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-vl-plus" as const,
  {
    ...QWEN3_VL_BASE,
    name: "Qwen3 VL Plus",
    context: 1048576,
    created: "2025-07-23",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

export const qwen3Vl235b = presetFor<CanonicalModelId, CatalogModel>()(
  "alibaba/qwen3-vl-235b" as const,
  {
    ...QWEN3_VL_BASE,
    name: "Qwen3 VL 235B",
    created: "2025-04-29",
    knowledge: "2025-04",
  } satisfies CatalogModel,
);

const qwenAtomic = {
  v3: [qwen3_235b, qwen3_32b, qwen3_14b, qwen3_8b, qwen3Max],
  "v3.5": [qwen35Plus, qwen35_397b],
  "v3.6": [qwen36Plus, qwen36Flash],
  coder: [qwen3CoderPlus, qwen3CoderFlash, qwen3Coder480b, qwen3Coder30b],
  vl: [qwen3VlPlus, qwen3Vl235b],
} as const;

const qwenGroups = {
  "v3.x": [...qwenAtomic["v3"], ...qwenAtomic["v3.5"], ...qwenAtomic["v3.6"]],
} as const;

export const qwen = {
  ...qwenAtomic,
  ...qwenGroups,
  latest: [...qwenAtomic["v3.6"]],
  all: Object.values(qwenAtomic).flat(),
} as const;
