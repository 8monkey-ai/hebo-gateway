import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import {
  openAIDimensionsMiddleware,
  openAIPromptCachingMiddleware,
  openAIReasoningMiddleware,
} from "./middleware";

test("openAI middleware > matching patterns", () => {
  const languageMatching = [
    "openai/gpt-5",
    "openai/gpt-5.2-chat",
    "openai/gpt-5.3-codex",
    "openai/gpt-oss-20b",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const languageNonMatching = [
    "openai/text-embedding-3-small",
    "anthropic/claude-sonnet-3.7",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of languageMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(openAIReasoningMiddleware);
    expect(middleware).toContain(openAIPromptCachingMiddleware);
  }

  for (const id of languageNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(openAIReasoningMiddleware);
  }

  const embeddingMatching = [
    "openai/text-embedding-3-small",
    "openai/text-embedding-3-large",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const embeddingNonMatching = ["openai/gpt-5"] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of embeddingMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(openAIDimensionsMiddleware);
  }

  for (const id of embeddingNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(openAIDimensionsMiddleware);
  }
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
    model: new MockLanguageModelV3({ modelId: "openai/gpt-5" }),
  });

  expect(result.providerOptions).toEqual({
    openai: {
      promptCacheKey: "tenant:shared:legal-v1",
      promptCacheRetention: "24h",
    },
    unknown: {},
  });
});

test("openAIReasoningMiddleware > should map reasoning effort to OpenAI provider options", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: {
        reasoningEffort: "high",
      },
      unknown: {},
    },
  });
});

test("openAIReasoningMiddleware > should disable reasoning when requested (standard model)", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: {
        reasoningEffort: "none",
      },
      unknown: {},
    },
  });
});

test("openAIReasoningMiddleware > should map reasoning for gpt-oss models", async () => {
  const cases = [
    { reasoning: { enabled: false }, expected: "low" },
    { reasoning: { enabled: true }, expected: "low" },
    { reasoning: { enabled: true, effort: "none" }, expected: "low" },
    { reasoning: { enabled: true, effort: "minimal" }, expected: "low" },
    { reasoning: { enabled: true, effort: "low" }, expected: "low" },
    { reasoning: { enabled: true, effort: "medium" }, expected: "medium" },
    { reasoning: { enabled: true, effort: "high" }, expected: "high" },
    { reasoning: { enabled: true, effort: "xhigh" }, expected: "high" },
  ] as const;

  await Promise.all(
    cases.map(async ({ reasoning, expected }) => {
      const params = {
        prompt: [],
        providerOptions: {
          unknown: { reasoning },
        },
      };

      const result = await openAIReasoningMiddleware.transformParams!({
        type: "generate",
        params,
        model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-20b" }),
      });

      expect(result.providerOptions?.openai.reasoningEffort).toBe(expected);
    }),
  );
});

test("openAIReasoningMiddleware > should default reasoning effort when enabled without effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: {},
      unknown: {},
    },
  });
});
