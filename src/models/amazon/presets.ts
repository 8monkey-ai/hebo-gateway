import type { CanonicalProviderId } from "../../providers/types";
import type { CanonicalModelId, CatalogModel } from "../types";

import { presetFor, type DeepPartial } from "../../utils/preset";

const NOVA_TEXT_BASE = {
  modalities: {
    input: ["text"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "temperature"] as const,
  providers: ["bedrock"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const NOVA_MULTIMODAL_BASE = {
  modalities: {
    input: ["text", "image", "video", "pdf"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "temperature"] as const,
  providers: ["bedrock"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

const NOVA_EMBEDDINGS_BASE = {
  modalities: {
    input: ["text", "image", "audio", "video", "pdf"] as const,
    output: ["embedding"] as const,
  },
  providers: ["bedrock"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const novaMicro = presetFor<CanonicalModelId, CatalogModel>()("amazon/nova-micro" as const, {
  ...NOVA_TEXT_BASE,
  name: "Amazon Nova Micro",
  created: "2024-12-03",
  knowledge: "2024-10",
  context: 128000,
} satisfies CatalogModel);

export const novaLite = presetFor<CanonicalModelId, CatalogModel>()("amazon/nova-lite" as const, {
  ...NOVA_MULTIMODAL_BASE,
  name: "Amazon Nova Lite",
  created: "2024-12-03",
  knowledge: "2024-10",
  context: 300000,
} satisfies CatalogModel);

export const novaPro = presetFor<CanonicalModelId, CatalogModel>()("amazon/nova-pro" as const, {
  ...NOVA_MULTIMODAL_BASE,
  name: "Amazon Nova Pro",
  created: "2024-12-03",
  knowledge: "2024-10",
  context: 300000,
} satisfies CatalogModel);

export const novaPremier = presetFor<CanonicalModelId, CatalogModel>()(
  "amazon/nova-premier" as const,
  {
    ...NOVA_MULTIMODAL_BASE,
    name: "Amazon Nova Premier",
    created: "2024-12-03",
    knowledge: "2024-10",
    context: 1000000,
  } satisfies CatalogModel,
);

export const nova2Lite = presetFor<CanonicalModelId, CatalogModel>()(
  "amazon/nova-2-lite" as const,
  {
    ...NOVA_TEXT_BASE,
    name: "Amazon Nova 2 Lite",
    created: "2025-12-01",
    knowledge: "2024-10",
    context: 128000,
  } satisfies CatalogModel,
);

export const nova2MultimodalEmbeddings = presetFor<CanonicalModelId, CatalogModel>()(
  "amazon/nova-2-multimodal-embeddings" as const,
  {
    ...NOVA_EMBEDDINGS_BASE,
    name: "Amazon Nova Multimodal Embeddings",
    created: "2025-10-28",
    context: 8000,
  } satisfies CatalogModel,
);

const novaAtomic = {
  v1: [novaMicro, novaLite, novaPro, novaPremier],
  v2: [nova2Lite, nova2MultimodalEmbeddings],
} as const;

const novaGroups = {
  "v1.x": [...novaAtomic["v1"]],
  "v2.x": [...novaAtomic["v2"]],
} as const;

export const nova = {
  ...novaAtomic,
  ...novaGroups,
  latest: [...novaAtomic["v1"], ...novaAtomic["v2"]],
  embeddings: [nova2MultimodalEmbeddings],
  all: Object.values(novaAtomic).flat(),
} as const;
