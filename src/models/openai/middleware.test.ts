import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { transcriptionProviderOptions } from "../../../test/helpers/transcription.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { azureTranscriptionOptionsMiddleware } from "../../providers/azure/middleware.ts";
import type { ModelSpec } from "../types.ts";
import {
  openAIDimensionsMiddleware,
  openAIPromptCachingMiddleware,
  openAIReasoningMiddleware,
  openAITranscribeMiddleware,
} from "./middleware.ts";

test("openAI middleware > matching patterns", () => {
  for (const id of ["openai/gpt-5.4-mini", "openai/gpt-6-sol", "openai/gpt-oss-20b", "openai/o3"]) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(openAIReasoningMiddleware());
    expect(middleware).toContain(openAIPromptCachingMiddleware);
  }

  const embeddingMatching = ["openai/text-embedding-3-small", "openai/text-embedding-3-large"];
  for (const id of embeddingMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(openAIDimensionsMiddleware);
  }
  expect(
    modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: "openai/gpt-5.4-mini" }),
  ).not.toContain(openAIDimensionsMiddleware);
});

test("openAIPromptCachingMiddleware > should map key and retention", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        prompt_cache_key: "tenant:shared:legal-v1",
        prompt_cache_retention: "24h",
      },
    },
  };

  const result = await openAIPromptCachingMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "openai/gpt-5.4-mini" }),
  });

  expect(result.providerOptions).toEqual({
    openai: {
      promptCacheKey: "tenant:shared:legal-v1",
      promptCacheRetention: "24h",
    },
    unknown: {},
  });
});

const effortOf = async (spec: ModelSpec, reasoning: JSONObject) =>
  (await transform(openAIReasoningMiddleware(spec), withReasoning(reasoning))).providerOptions?.[
    "openai"
  ]?.["reasoningEffort"];

// models.dev effort levels of a few models.
const GPT_5: ModelSpec = { reasoning: { effort: ["minimal", "low", "medium", "high"] } };
const GPT_5_2: ModelSpec = { reasoning: { effort: ["none", "low", "medium", "high", "xhigh"] } };
const GPT_6_SOL: ModelSpec = {
  reasoning: { effort: ["none", "low", "medium", "high", "xhigh", "max"] },
};
const GPT_6_1_SOL: ModelSpec = { reasoning: { effort: ["low", "medium", "high", "xhigh", "max"] } };

describe("openAIReasoningMiddleware", () => {
  test.each([
    [GPT_6_SOL, "max", "max"],
    [GPT_6_SOL, "minimal", "low"],
    [GPT_5_2, "max", "xhigh"],
    [GPT_5, "minimal", "minimal"],
    [GPT_5, "xhigh", "high"],
    [GPT_5_2, "high", "high"],
  ] as const)("maps to an effort the model lists (%#)", async (spec, effort, expected) => {
    expect(await effortOf(spec, { enabled: true, effort })).toBe(expected);
  });

  test.each([{ enabled: false }, { enabled: false, effort: "none" }])(
    "turns reasoning off with `none`, or the lowest effort when the model can't (%o)",
    async (reasoning) => {
      expect(await effortOf(GPT_6_SOL, reasoning)).toBe("none");
      expect(await effortOf(GPT_6_1_SOL, reasoning)).toBe("low");
      expect(await effortOf(GPT_5, reasoning)).toBe("minimal");
    },
  );

  test("passes efforts through for models without a spec", async () => {
    expect(await effortOf({}, { enabled: true, effort: "max" })).toBe("max");
  });

  test("drops reasoning for models that don't reason", async () => {
    const result = await transform(
      openAIReasoningMiddleware({ reasoning: false }),
      withReasoning({ enabled: true, effort: "high" }),
    );
    expect(result.providerOptions).toEqual({ unknown: {} });
  });

  test("sends no effort when enabled without one", async () => {
    expect(await effortOf(GPT_6_SOL, { enabled: true, max_tokens: 1000 })).toBeUndefined();
  });

  // `reasoning_effort` used to be forwarded verbatim, over the mapped effort.
  test("the mapped effort reaches the provider", async () => {
    let params = withReasoning({ enabled: false, effort: "none" });
    for (const middleware of modelMiddlewareMatcher.for(
      "openai/gpt-6.1-sol",
      "openai.responses",
      GPT_6_1_SOL,
    )) {
      // oxlint-disable-next-line no-await-in-loop
      if (middleware.transformParams) params = await transform(middleware, params);
    }
    expect(params.providerOptions).toEqual({ openai: { reasoningEffort: "low" } });
  });
});

describe("openAITranscribeMiddleware", () => {
  test("should match GPT Transcribe for transcriptions only", () => {
    expect(
      modelMiddlewareMatcher.resolve({ kind: "transcription", modelId: "openai/gpt-transcribe" }),
    ).toContain(openAITranscribeMiddleware);
    expect(
      modelMiddlewareMatcher.resolve({ kind: "text", modelId: "openai/gpt-transcribe" }),
    ).not.toContain(openAITranscribeMiddleware);
  });

  test("should force json and no timestamps", async () => {
    expect(
      await transcriptionProviderOptions({
        modelId: "openai/gpt-transcribe",
        provider: "openai.transcription",
        providerModelId: "gpt-transcribe",
        inputs: { language: "en", prompt: "hi", temperature: 0.2 },
      }),
    ).toEqual({
      openai: {
        language: "en",
        prompt: "hi",
        temperature: 0.2,
        responseFormat: "json",
        timestampGranularities: [],
      },
    });
  });

  test("should apply to custom Azure deployment names", async () => {
    expect(
      modelMiddlewareMatcher.forTranscription("openai/gpt-transcribe", "azure.transcription"),
    ).toContain(azureTranscriptionOptionsMiddleware);
    expect(
      await transcriptionProviderOptions({
        modelId: "openai/gpt-transcribe",
        provider: "azure.transcription",
        providerModelId: "production-transcribe",
      }),
    ).toEqual({ openai: { responseFormat: "json", timestampGranularities: [] } });
  });

  test("should forward explicit timestamp granularities for upstream to validate", async () => {
    expect(
      await transcriptionProviderOptions({
        modelId: "openai/gpt-transcribe",
        provider: "openai.transcription",
        providerModelId: "gpt-transcribe",
        inputs: { timestamp_granularities: ["word"] },
      }),
    ).toEqual({ openai: { responseFormat: "json", timestampGranularities: ["word"] } });
  });
});
