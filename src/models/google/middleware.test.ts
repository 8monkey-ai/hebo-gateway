import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

import { transcriptionProviderOptions } from "../../../test/helpers/transcription";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import {
  geminiDimensionsMiddleware,
  geminiPromptCachingMiddleware,
  geminiReasoningMiddleware,
  geminiTranscribeMiddleware,
} from "./middleware";

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
