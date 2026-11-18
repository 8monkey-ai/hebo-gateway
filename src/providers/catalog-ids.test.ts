import { describe, expect, test } from "bun:test";

import { createAlibaba } from "@ai-sdk/alibaba";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createFireworks } from "@ai-sdk/fireworks";
import { createGroq } from "@ai-sdk/groq";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderV4 } from "@ai-sdk/provider";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import { createVoyage } from "voyage-ai-provider";
import { createZhipu } from "zhipu-ai-provider";

import { loadBundledCatalog } from "../../test/helpers/catalog.ts";
import { withCanonicalIdsForAlibaba } from "./alibaba/canonical.ts";
import { withCanonicalIdsForAnthropic } from "./anthropic/canonical.ts";
import { withCanonicalIdsForAzure } from "./azure/canonical.ts";
import { withCanonicalIdsForChutes } from "./chutes/canonical.ts";
import { withCanonicalIdsForCohere } from "./cohere/canonical.ts";
import { withCanonicalIdsForDeepInfra } from "./deepinfra/canonical.ts";
import { withCanonicalIdsForDeepSeek } from "./deepseek/canonical.ts";
import { withCanonicalIdsForFireworks } from "./fireworks/canonical.ts";
import { withCanonicalIdsForGroq } from "./groq/canonical.ts";
import { withCanonicalIdsForMinimax } from "./minimax/canonical.ts";
import { withCanonicalIdsForMoonshot } from "./moonshot/canonical.ts";
import { withCanonicalIdsForOpenAI } from "./openai/canonical.ts";
import { withCanonicalIdsForTogetherAI } from "./togetherai/canonical.ts";
import { withCanonicalIdsForVoyage } from "./voyage/canonical.ts";
import { withCanonicalIdsForXai } from "./xai/canonical.ts";
import { withCanonicalIdsForZai } from "./zai/canonical.ts";

const apiKey = "test-key";

// Bedrock and Vertex rewrite native IDs (inference profiles, Mantle, MaaS): see their tests.
const PROVIDERS: Record<string, () => ProviderV4> = {
  alibaba: () => withCanonicalIdsForAlibaba(createAlibaba({ apiKey })),
  anthropic: () => withCanonicalIdsForAnthropic(createAnthropic({ apiKey })),
  azure: () => withCanonicalIdsForAzure(createAzure({ resourceName: "test", apiKey })),
  chutes: () => withCanonicalIdsForChutes(createOpenAI({ apiKey })),
  cohere: () => withCanonicalIdsForCohere(createCohere({ apiKey })),
  deepinfra: () => withCanonicalIdsForDeepInfra(createDeepInfra({ apiKey })),
  deepseek: () => withCanonicalIdsForDeepSeek(createDeepSeek({ apiKey })),
  fireworks: () => withCanonicalIdsForFireworks(createFireworks({ apiKey })),
  groq: () => withCanonicalIdsForGroq(createGroq({ apiKey })),
  minimax: () => withCanonicalIdsForMinimax(createOpenAI({ apiKey })),
  moonshot: () => withCanonicalIdsForMoonshot(createMoonshotAI({ apiKey })),
  openai: () => withCanonicalIdsForOpenAI(createOpenAI({ apiKey })),
  togetherai: () => withCanonicalIdsForTogetherAI(createTogetherAI({ apiKey })),
  voyage: () => withCanonicalIdsForVoyage(createVoyage({ apiKey })),
  xai: () => withCanonicalIdsForXai(createXai({ apiKey })),
  zai: () => withCanonicalIdsForZai(createZhipu({ apiKey })),
};

const hasTranscription = (provider: ProviderV4) => {
  try {
    provider.transcriptionModel?.("probe");
    return true;
  } catch {
    return false;
  }
};

describe("bundled catalog native IDs", () => {
  for (const [id, create] of Object.entries(PROVIDERS)) {
    test(`${id} serves every bundled model under its models.dev native ID`, () => {
      const provider = create();
      const catalog = loadBundledCatalog(id, provider);

      for (const [modelId, model] of Object.entries(catalog)) {
        const output = model!.modalities?.output ?? [];
        // Some SDKs serve no transcription models at all.
        if (output.includes("transcription") && !hasTranscription(provider)) continue;

        // Only the ID matters: building a model issues no request.
        const resolved = output.includes("embeddings")
          ? provider.embeddingModel(modelId)
          : output.includes("transcription")
            ? provider.transcriptionModel!(modelId)
            : provider.languageModel(modelId);
        expect(resolved.modelId, modelId).toBe(model!.providers[id]!);
      }
    });
  }
});
