import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import {
  runTranscriptionChain,
  transcriptionProviderOptions,
} from "../../../test/helpers/transcription.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { wordSegmentsMiddleware } from "../../middleware/transcription.ts";
import type { ModelSpec } from "../types.ts";
import {
  geminiDimensionsMiddleware,
  geminiPromptCachingMiddleware,
  geminiReasoningMiddleware,
  geminiTranscribeMiddleware,
} from "./middleware.ts";

test("geminiReasoningMiddleware > matches every Gemini, prompt caching only Gemini 3", () => {
  for (const id of ["google/gemini-3.7-flash", "google/gemini-4-argon", "google/gemini-5-pro"]) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(geminiReasoningMiddleware);
    expect(middleware.includes(geminiPromptCachingMiddleware)).toBe(
      id.startsWith("google/gemini-3"),
    );
  }
});

test("geminiPromptCachingMiddleware > should map normalized cached_content", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        cached_content: "cachedContents/reusable",
      },
    },
  };

  const result = await geminiPromptCachingMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "google/gemini-3.7-flash" }),
  });

  expect(result.providerOptions).toEqual({
    unknown: {
      cached_content: "cachedContents/reusable",
    },
  });
});

test("geminiDimensionsMiddleware > matching patterns", () => {
  const matching = ["google/gemini-embedding-2"];
  const nonMatching = ["google/gemini-3-flash-preview"];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(geminiDimensionsMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(geminiDimensionsMiddleware);
  }
});

const thinkingOf = async (spec: ModelSpec, reasoning: JSONObject): Promise<unknown> =>
  (await transform(geminiReasoningMiddleware, withReasoning(reasoning), { spec }))
    .providerOptions?.["google"]?.["thinkingConfig"];

// models.dev thinking levels of a few models.
const FLASH_3: ModelSpec = { reasoning: { effort: ["minimal", "low", "medium", "high"] } };
const GEMINI_4: ModelSpec = { reasoning: { effort: ["low", "medium", "high"] } };
const HYDROGEN: ModelSpec = { reasoning: { effort: ["low", "medium", "high", "xhigh"] } };

describe("geminiReasoningMiddleware", () => {
  test.each([
    [FLASH_3, "minimal", "minimal"],
    [GEMINI_4, "minimal", "low"],
    [GEMINI_4, "max", "high"],
    [HYDROGEN, "max", "xhigh"],
    [GEMINI_4, "medium", "medium"],
  ] as const)("maps to a level the model lists (%#)", async (spec, effort, thinkingLevel) => {
    expect(await thinkingOf(spec, { enabled: true, effort })).toEqual({
      thinkingLevel,
      includeThoughts: true,
    });
  });

  test("maps off to the lowest level, without thoughts", async () => {
    expect(await thinkingOf(FLASH_3, { enabled: false, effort: "none" })).toEqual({
      thinkingLevel: "minimal",
      includeThoughts: false,
    });
    expect(await thinkingOf(GEMINI_4, { enabled: false })).toEqual({
      thinkingLevel: "low",
      includeThoughts: false,
    });
  });

  test("excludes thoughts when asked", async () => {
    expect(await thinkingOf(GEMINI_4, { enabled: true, effort: "high", exclude: true })).toEqual({
      thinkingLevel: "high",
      includeThoughts: false,
    });
  });

  test("passes explicit thinking options through", async () => {
    const params = withReasoning({ enabled: true, effort: "high" });
    params.providerOptions!["unknown"]!["thinking_config"] = { thinking_budget: 100 };
    const result = await transform(geminiReasoningMiddleware, params, { spec: GEMINI_4 });
    expect(result.providerOptions?.["google"]).toBeUndefined();
  });
});

test("geminiTranscribeMiddleware > matching patterns", () => {
  expect(
    modelMiddlewareMatcher.resolve({
      kind: "transcription",
      modelId: "google/gemini-3.5-transcribe",
    }),
  ).toContain(geminiTranscribeMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", modelId: "google/gemini-3.5-flash" }),
  ).not.toContain(geminiTranscribeMiddleware);
});

test("geminiTranscribeMiddleware > maps language and word timestamps", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "google/gemini-3.5-transcribe",
      provider: "google.vertex.transcription",
      providerModelId: "gemini-3.5-transcribe",
      inputs: { language: "en-US", timestamp_granularities: ["word"] },
    }),
  ).toEqual({ vertex: { languageCodes: ["en-US"], wordTimestamp: true } });
});

test("geminiTranscribeMiddleware > forwards unsupported params for upstream to validate", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "google/gemini-3.5-transcribe",
      provider: "google.vertex.transcription",
      providerModelId: "gemini-3.5-transcribe",
      inputs: { temperature: 0.5 },
    }),
  ).toEqual({ vertex: { temperature: 0.5 } });
});

test("geminiTranscribeMiddleware > returns word timings as words, not segments", async () => {
  const words = [
    { text: "hello", startSecond: 0, endSecond: 0.4 },
    { text: "world", startSecond: 0.4, endSecond: 0.9 },
  ];

  expect(
    modelMiddlewareMatcher.resolve({
      kind: "transcription",
      modelId: "google/gemini-3.5-transcribe",
    }),
  ).toContain(wordSegmentsMiddleware);

  const { result } = await runTranscriptionChain({
    modelId: "google/gemini-3.5-transcribe",
    provider: "google.vertex.transcription",
    providerModelId: "gemini-3.5-transcribe",
    inputs: { timestamp_granularities: ["word"] },
    segments: words,
  });
  expect(result.segments).toEqual([]);
  expect(result.words).toEqual(words);
});
