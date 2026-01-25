import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const VOYAGE_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["embeddings"] as const,
  },
  providers: ["voyage"] as const,
} satisfies DeepPartial<CatalogModel>;

export const voyage2Code = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-2-code" as const,
  {
    name: "Voyage 2 Code",
    created: "2024-01",
    context: 16000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage2Finance = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-2-finance" as const,
  {
    name: "Voyage 2 Finance",
    created: "2024-03",
    context: 32000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage2Law = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-2-law" as const,
  {
    name: "Voyage 2 Law",
    created: "2024-03",
    context: 16000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage3Code = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-3-code" as const,
  {
    name: "Voyage 3 Code",
    created: "2024-09",
    context: 32000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage3Large = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-3-large" as const,
  {
    name: "Voyage 3 Large",
    created: "2024-09",
    context: 32000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage35 = presetFor<CanonicalModelId, CatalogModel>()("voyage/voyage-3.5" as const, {
  name: "Voyage 3.5",
  created: "2025-05-20",
  context: 32000,
  ...VOYAGE_BASE,
} satisfies CatalogModel);

export const voyage35Lite = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-3.5-lite" as const,
  {
    name: "Voyage 3.5 Lite",
    created: "2025-05-20",
    context: 32000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage4Lite = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-4-lite" as const,
  {
    name: "Voyage 4 Lite",
    created: "2026-01-15",
    context: 32000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

export const voyage4 = presetFor<CanonicalModelId, CatalogModel>()("voyage/voyage-4" as const, {
  name: "Voyage 4",
  created: "2026-01-15",
  context: 32000,
  ...VOYAGE_BASE,
} satisfies CatalogModel);

export const voyage4Large = presetFor<CanonicalModelId, CatalogModel>()(
  "voyage/voyage-4-large" as const,
  {
    name: "Voyage 4 Large",
    created: "2026-01-15",
    context: 32000,
    ...VOYAGE_BASE,
  } satisfies CatalogModel,
);

const voyageAtomic = {
  v2: [voyage2Code, voyage2Finance, voyage2Law],
  v3: [voyage3Code, voyage3Large],
  "v3.5": [voyage35, voyage35Lite],
  v4: [voyage4Lite, voyage4, voyage4Large],
} as const;

const voyageGroups = {
  "v2.x": [...voyageAtomic["v2"]],
  "v3.x": [...voyageAtomic["v3"], ...voyageAtomic["v3.5"]],
  "v4.x": [...voyageAtomic["v4"]],
} as const;

export const voyage = {
  ...voyageAtomic,
  ...voyageGroups,
  latest: [voyage2Finance, voyage2Law, voyage3Code, voyage4Lite, voyage4, voyage4Large],
  all: Object.values(voyageAtomic).flat(),
} as const;
