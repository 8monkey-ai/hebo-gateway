import type { CanonicalProviderId } from "../../providers/types";
import { presetFor, type DeepPartial } from "../../utils/preset";
import type { CanonicalModelId, CatalogModel } from "../types";

// MAI-Transcribe models are served by Azure's Speech API (not Azure OpenAI deployments).
const MAI_TRANSCRIBE_BASE = {
  modalities: {
    input: ["audio"] as const,
    output: ["text"] as const,
  },
  providers: ["azure"] as const satisfies readonly CanonicalProviderId[],
} satisfies DeepPartial<CatalogModel>;

export const maiTranscribe15 = presetFor<CanonicalModelId, CatalogModel>()(
  "microsoft/mai-transcribe-1.5" as const,
  {
    ...MAI_TRANSCRIBE_BASE,
    name: "MAI-Transcribe 1.5",
    created: "2026-06-02",
  } satisfies CatalogModel,
);

export const maiTranscribe2 = presetFor<CanonicalModelId, CatalogModel>()(
  "microsoft/mai-transcribe-2" as const,
  {
    ...MAI_TRANSCRIBE_BASE,
    name: "MAI-Transcribe 2",
    created: "2026-09-03",
  } satisfies CatalogModel,
);

const maiTranscribeAtomic = {
  "v1.5": [maiTranscribe15],
  v2: [maiTranscribe2],
} as const;

const maiTranscribeGroups = {
  "v1.x": [...maiTranscribeAtomic["v1.5"]],
  "v2.x": [...maiTranscribeAtomic["v2"]],
} as const;

export const maiTranscribe = {
  ...maiTranscribeAtomic,
  ...maiTranscribeGroups,
  latest: [...maiTranscribeAtomic["v2"]],
  all: Object.values(maiTranscribeAtomic).flat(),
} as const;
