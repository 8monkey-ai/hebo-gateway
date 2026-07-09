import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const GLM_5_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["reasoning", "tool_call", "structured_output", "temperature"] as const,
  context: 200000,
} satisfies DeepPartial<CatalogModel>;

export const glm5 = presetFor<CanonicalModelId, CatalogModel>()("zhipu/glm-5" as const, {
  ...GLM_5_BASE,
  name: "GLM 5",
  created: "2026-02-11",
  context: 204800,
  providers: ["zai", "deepinfra", "chutes", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

export const glm5Turbo = presetFor<CanonicalModelId, CatalogModel>()("zhipu/glm-5-turbo" as const, {
  ...GLM_5_BASE,
  name: "GLM 5 Turbo",
  created: "2026-03-15",
  providers: ["zai"] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

export const glm51 = presetFor<CanonicalModelId, CatalogModel>()("zhipu/glm-5.1" as const, {
  ...GLM_5_BASE,
  name: "GLM 5.1",
  created: "2026-03-27",
  providers: ["zai", "deepinfra", "chutes", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

export const glm52 = presetFor<CanonicalModelId, CatalogModel>()("zhipu/glm-5.2" as const, {
  ...GLM_5_BASE,
  name: "GLM 5.2",
  context: 1_000_000,
  created: "2026-06-13",
  providers: ["zai", "deepinfra", "chutes", "togetherai", "fireworks"] as const satisfies readonly CanonicalProviderId[],
} satisfies CatalogModel);

const glmAtomic = {
  v5: [glm5, glm5Turbo],
  "v5.1": [glm51],
  "v5.2": [glm52],
} as const;

const glmGroups = {
  "v5.x": [...glmAtomic["v5"], ...glmAtomic["v5.1"], ...glmAtomic["v5.2"]],
} as const;

export const glm = {
  ...glmAtomic,
  ...glmGroups,
  latest: [...glmAtomic["v5.2"]],
  all: Object.values(glmAtomic).flat(),
} as const;
