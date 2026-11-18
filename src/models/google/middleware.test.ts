import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

import {
  runTranscriptionChain,
  transcriptionProviderOptions,
} from "../../../test/helpers/transcription.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { wordSegmentsMiddleware } from "../../middleware/transcription.ts";
import { CANONICAL_MODEL_IDS } from "../../models/types.ts";
import {
  geminiDimensionsMiddleware,
  geminiPromptCachingMiddleware,
  geminiReasoningMiddleware,
  geminiTranscribeMiddleware,
} from "./middleware.ts";

test("geminiReasoningMiddleware > matching patterns", () => {
  const matching = [
    "google/gemini-3-flash-preview",
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.7-flash",
    "google/gemini-3.8-flash",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = [
    "google/gemini-1.5-pro",
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
  ];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(geminiReasoningMiddleware);
    expect(middleware).toContain(geminiPromptCachingMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(geminiReasoningMiddleware);
  }
});

test("geminiReasoningMiddleware > matches Gemini 4 without explicit prompt caching", () => {
  const ids = [
    "google/gemini-4-hydrogen",
    "google/gemini-4-argon",
    "google/gemini-4-carbon",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of ids) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(geminiReasoningMiddleware);
    expect(middleware).not.toContain(geminiPromptCachingMiddleware);
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
  const matching = ["google/gemini-embedding-2"] satisfies (typeof CANONICAL_MODEL_IDS)[number][];
  const nonMatching = [
    "google/gemini-3-flash-preview",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(geminiDimensionsMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(geminiDimensionsMiddleware);
  }
});

test("geminiReasoningMiddleware > should enable thinking for Gemini 3 Flash effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "medium",
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should map medium effort for Gemini 3.1 Pro", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "google/gemini-3.1-pro-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "medium",
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should normalize none effort for Gemini 3.1 Flash Lite", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false, effort: "none" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "google/gemini-3.1-flash-lite" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: 0,
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should handle disabled reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false, effort: "none" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: 0,
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should default reasoning effort for Gemini 3 Flash", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
      unknown: {},
    },
  });
});

// Uses the provider-native id: newer Gemini 3.x minors must hit the same branch
// without an added pattern, so 3.8+ needs no middleware change.
test("geminiReasoningMiddleware > should map thinking level for Gemini 3.7 Flash", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "gemini-3.7-flash" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "high",
          includeThoughts: true,
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should keep the minimal level on Gemini 3.6 Flash", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "gemini-3.6-flash" }),
  });

  expect(result.providerOptions).toEqual({
    google: {
      thinkingConfig: { thinkingLevel: "minimal", includeThoughts: true },
    },
    unknown: {},
  });
});

// Flash dropped `minimal` after 3.6: an unlisted level is rejected, so it becomes `low`.
test("geminiReasoningMiddleware > should collapse minimal to low on Gemini 3.8 Flash", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "gemini-3.8-flash" }),
  });

  expect(result.providerOptions).toEqual({
    google: {
      thinkingConfig: { thinkingLevel: "low", includeThoughts: true },
    },
    unknown: {},
  });
});

const runGemini4Reasoning = async (
  modelId: string,
  reasoning: { enabled: boolean; effort: string },
) => {
  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { unknown: { reasoning } } },
    model: new MockLanguageModelV4({ modelId }),
  });
  return result.providerOptions?.["google"]?.["thinkingConfig"];
};

// Gemini 4 always thinks and rejects `thinkingBudget` and `minimal` with a 400.
test("geminiReasoningMiddleware > maps none and minimal to low on Gemini 4", async () => {
  const ids = ["gemini-4-argon", "gemini-4-carbon", "gemini-4-hydrogen"];

  const none = await Promise.all(
    ids.map((id) => runGemini4Reasoning(id, { enabled: false, effort: "none" })),
  );
  const minimal = await Promise.all(
    ids.map((id) => runGemini4Reasoning(id, { enabled: true, effort: "minimal" })),
  );

  for (const config of none) {
    expect(config).toEqual({ thinkingLevel: "low", includeThoughts: false });
  }
  for (const config of minimal) {
    expect(config).toEqual({ thinkingLevel: "low", includeThoughts: true });
  }
});

test("geminiReasoningMiddleware > passes medium and high through on Gemini 4", async () => {
  expect(await runGemini4Reasoning("gemini-4-argon", { enabled: true, effort: "medium" })).toEqual({
    thinkingLevel: "medium",
    includeThoughts: true,
  });
  expect(await runGemini4Reasoning("gemini-4-carbon", { enabled: true, effort: "high" })).toEqual({
    thinkingLevel: "high",
    includeThoughts: true,
  });
});

// Only Hydrogen lists `xhigh`; Argon and Carbon top out at `high`.
test("geminiReasoningMiddleware > maps xhigh and max per Gemini 4 model", async () => {
  const cases = [
    ["gemini-4-hydrogen", "xhigh"],
    ["gemini-4-argon", "high"],
    ["gemini-4-carbon", "high"],
  ] as const;

  const results = await Promise.all(
    cases.flatMap(([id]) =>
      ["xhigh", "max"].map((effort) => runGemini4Reasoning(id, { enabled: true, effort })),
    ),
  );

  expect(results).toEqual(
    cases.flatMap(([, level]) => [
      { thinkingLevel: level, includeThoughts: true },
      { thinkingLevel: level, includeThoughts: true },
    ]),
  );
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
