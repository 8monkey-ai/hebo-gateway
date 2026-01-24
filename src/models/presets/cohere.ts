import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const COHERE_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embeddings"] as const,
  },
  context: 128000,
  providers: ["cohere", "bedrock"] as const,
} satisfies DeepPartial<CatalogModel>;

export const cohereEmbed4 = presetFor<CanonicalModelId, CatalogModel>()(
  "cohere/embed-v4.0" as const,
  {
    name: "Cohere 4 Embeddings",
    created: "2026-01-15",
    ...COHERE_BASE,
  } satisfies CatalogModel,
);

const cohereAtomic = {
  v4: [cohereEmbed4],
} as const;

const cohereGroups = {
  v4_x: [...cohereAtomic.v4],
} as const;

export const cohere = {
  ...cohereAtomic,
  ...cohereGroups,
  latest: [...cohereAtomic.v4],
  all: Object.values(cohereAtomic).flat(),
} as const;
