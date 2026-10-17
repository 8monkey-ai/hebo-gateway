import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

const GROK_BASE = {
  modalities: {
    input: ["text", "image"] as const,
    output: ["text"] as const,
  },
  capabilities: ["tool_call", "structured_output", "temperature"] as const,
  providers: ["xai"] as const satisfies readonly CanonicalProviderId[],
  context: 2000000,
} satisfies DeepPartial<CatalogModel>;

const GROK_REASONING_BASE = {
  ...GROK_BASE,
  capabilities: ["tool_call", "structured_output", "reasoning", "temperature"] as const,
} satisfies DeepPartial<CatalogModel>;

export const grok42 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.2" as const, {
  ...GROK_BASE,
  name: "Grok 4.2",
  created: "2026-03-16",
  knowledge: "2024-11",
} satisfies CatalogModel);

export const grok43 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.3" as const, {
  ...GROK_REASONING_BASE,
  name: "Grok 4.3",
  created: "2026-05-01",
  knowledge: "2024-11",
  context: 1000000,
} satisfies CatalogModel);

export const grok420 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.20" as const, {
  ...GROK_REASONING_BASE,
  name: "Grok 4.20",
  created: "2026-03-09",
  knowledge: "2024-11",
} satisfies CatalogModel);

export const grok420MultiAgent = presetFor<CanonicalModelId, CatalogModel>()(
  "xai/grok-4.20-multi-agent" as const,
  {
    ...GROK_REASONING_BASE,
    name: "Grok 4.20 Multi-Agent",
    created: "2026-03-09",
    knowledge: "2024-11",
  } satisfies CatalogModel,
);

export const grok45 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.5" as const, {
  ...GROK_REASONING_BASE,
  name: "Grok 4.5",
  created: "2026-07-08",
  context: 500000,
} satisfies CatalogModel);

export const grok46 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.6" as const, {
  ...GROK_REASONING_BASE,
  name: "Grok 4.6",
  created: "2026-08-12",
  knowledge: "2026-02",
  context: 500000,
} satisfies CatalogModel);

export const grok47 = presetFor<CanonicalModelId, CatalogModel>()("xai/grok-4.7" as const, {
  ...GROK_REASONING_BASE,
  name: "Grok 4.7",
  created: "2026-09-21",
  knowledge: "2026-05",
  context: 500000,
} satisfies CatalogModel);

export const grokVoiceTranscribe20 = presetFor<CanonicalModelId, CatalogModel>()(
  "xai/grok-voice-transcribe-2.0" as const,
  {
    name: "Grok Voice Transcribe 2.0",
    modalities: {
      input: ["audio"] as const,
      output: ["text"] as const,
    },
    providers: ["xai"] as const satisfies readonly CanonicalProviderId[],
  } satisfies CatalogModel,
);

const grokAtomic = {
  "v4.2": [grok42],
  "v4.3": [grok43],
  "v4.20": [grok420, grok420MultiAgent],
  "v4.5": [grok45],
  "v4.6": [grok46],
  "v4.7": [grok47],
  transcription: [grokVoiceTranscribe20],
} as const;

const grokGroups = {} as const;

export const grok = {
  ...grokAtomic,
  ...grokGroups,
  latest: [...grokAtomic["v4.7"]],
  transcription: [...grokAtomic["transcription"]],
  all: Object.values(grokAtomic).flat(),
} as const;
