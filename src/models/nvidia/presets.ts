import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const NVIDIA_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "structured_output", "temperature"] as const,
  providers: ["nvidia"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const mistralNemotron = presetFor<CanonicalModelId, CatalogModel>()(
  "nvidia/mistral-nemotron" as const,
  {
    ...NVIDIA_BASE,
    name: "Mistral NeMo-Tron",
    created: "2025-03-24",
    knowledge: "2024-12",
    capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
    context: 131072,
  } satisfies CatalogModel,
);

export const mistralLarge3_675b = presetFor<CanonicalModelId, CatalogModel>()(
  "nvidia/mistral-large-3-675b" as const,
  {
    ...NVIDIA_BASE,
    name: "Mistral Large 3 675B",
    created: "2025-12-01",
    knowledge: "2025-06",
    capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
    context: 131072,
  } satisfies CatalogModel,
);

export const devstral2_123b = presetFor<CanonicalModelId, CatalogModel>()(
  "nvidia/devstral-2-123b" as const,
  {
    ...NVIDIA_BASE,
    name: "Devstral 2 123B",
    created: "2025-12-01",
    knowledge: "2025-06",
    capabilities: ["tool_call", "structured_output", "temperature"] as const,
    context: 131072,
  } satisfies CatalogModel,
);

export const qwen3Coder480b = presetFor<CanonicalModelId, CatalogModel>()(
  "nvidia/qwen3-coder-480b" as const,
  {
    ...NVIDIA_BASE,
    name: "Qwen3 Coder 480B",
    created: "2026-03-01",
    knowledge: "2025-06",
    capabilities: ["tool_call", "structured_output", "temperature"] as const,
    context: 131072,
  } satisfies CatalogModel,
);

export const deepseekV31Terminus = presetFor<CanonicalModelId, CatalogModel>()(
  "nvidia/deepseek-v3.1-terminus" as const,
  {
    ...NVIDIA_BASE,
    name: "DeepSeek V3.1 Terminus",
    created: "2025-11-01",
    knowledge: "2024-12",
    capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
    context: 131072,
  } satisfies CatalogModel,
);

export const kimiK2 = presetFor<CanonicalModelId, CatalogModel>()("nvidia/kimi-k2" as const, {
  ...NVIDIA_BASE,
  name: "Kimi K2",
  created: "2026-01-15",
  knowledge: "2025-06",
  capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
  context: 131072,
} satisfies CatalogModel);

export const glm47 = presetFor<CanonicalModelId, CatalogModel>()("nvidia/glm-4.7" as const, {
  ...NVIDIA_BASE,
  name: "GLM 4.7",
  created: "2026-02-01",
  knowledge: "2025-06",
  capabilities: ["tool_call", "structured_output", "temperature"] as const,
  context: 131072,
} satisfies CatalogModel);

const nvidiaAtomic = {
  nemotron: [mistralNemotron],
  mistral: [mistralLarge3_675b, devstral2_123b],
  community: [qwen3Coder480b, deepseekV31Terminus, kimiK2, glm47],
} as const;

const nvidiaGroups = {} as const;

export const nvidia = {
  ...nvidiaAtomic,
  ...nvidiaGroups,
  latest: [mistralNemotron],
  all: Object.values(nvidiaAtomic).flat(),
} as const;
