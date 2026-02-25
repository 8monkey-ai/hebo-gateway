import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import {
  novaDimensionsMiddleware,
  novaPromptCachingMiddleware,
  novaReasoningMiddleware,
} from "./middleware";

test("nova middleware > matching patterns", () => {
  const languageMatching = ["amazon/nova-2-lite"] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const languageNonMatching = [
    "amazon/nova-micro",
    "amazon/nova-lite",
    "amazon/nova-pro",
    "amazon/nova-premier",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of languageMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(novaReasoningMiddleware);
    expect(middleware).toContain(novaPromptCachingMiddleware);
  }

  for (const id of languageNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(novaReasoningMiddleware);
  }

  const embeddingMatching = [
    "amazon/nova-2-multimodal-embeddings",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const embeddingNonMatching = [
    "amazon/nova-2-lite",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of embeddingMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(novaDimensionsMiddleware);
  }

  for (const id of embeddingNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(novaDimensionsMiddleware);
  }
});

test("novaPromptCachingMiddleware > should map message cache_control to cache_point", async () => {
  const params = {
    prompt: [
      {
        role: "system",
        content: "You are helpful.",
        providerOptions: {
          unknown: {
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        },
      },
    ],
    providerOptions: {
      unknown: {},
    },
  };

  const result = await novaPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params as any,
    model: new MockLanguageModelV3({ modelId: "amazon/nova-2-lite" }),
  });

  expect((result.prompt[0] as any).providerOptions.unknown.cache_point).toEqual({
    type: "default",
    ttl: "1h",
  });
  expect((result.prompt[0] as any).providerOptions.unknown.cache_control).toBeUndefined();
});

test("novaPromptCachingMiddleware > should auto-add cache point when enabled", async () => {
  const params = {
    prompt: [
      {
        role: "system",
        content: "Large reusable policy prompt.",
      },
      {
        role: "user",
        content: [{ type: "text", text: "Summarize this." }],
      },
    ],
    providerOptions: {
      unknown: {
        cache_control: { type: "ephemeral", ttl: "5m" },
      },
    },
  };

  const result = await novaPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params as any,
    model: new MockLanguageModelV3({ modelId: "amazon/nova-2-lite" }),
  });

  expect((result.prompt[0] as any).providerOptions.unknown.cache_point).toEqual({
    type: "default",
    ttl: "5m",
  });
});

test("novaPromptCachingMiddleware > should use normalized cache_control over non-native fields", async () => {
  const params = {
    prompt: [
      {
        role: "system",
        content: "Reusable system context",
      },
    ],
    providerOptions: {
      unknown: {
        cache_control: { type: "ephemeral", ttl: "1h" },
        prompt_cache_retention: "24h",
        prompt_cache_key: "tenant-key",
        cached_content: "cachedContents/abc",
      },
    },
  };

  const result = await novaPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params as any,
    model: new MockLanguageModelV3({ modelId: "amazon/nova-2-lite" }),
  });

  expect((result.prompt[0] as any).providerOptions.unknown.cache_point).toEqual({
    type: "default",
    ttl: "1h",
  });
  expect(result.providerOptions?.unknown).toEqual({
    prompt_cache_retention: "24h",
    prompt_cache_key: "tenant-key",
    cached_content: "cachedContents/abc",
  });
});

test("novaReasoningMiddleware > should map effort to Bedrock reasoning config", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const result = await novaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      amazon: {
        reasoningConfig: {
          type: "enabled",
          maxReasoningEffort: "low",
        },
      },
      unknown: {},
    },
  });
});

test("novaReasoningMiddleware > should disable reasoning when requested", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await novaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      amazon: {
        reasoningConfig: {
          type: "disabled",
        },
      },
      unknown: {},
    },
  });
});

test("novaReasoningMiddleware > should default reasoning effort when enabled without effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await novaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      amazon: {
        reasoningConfig: {
          type: "enabled",
        },
      },
      unknown: {},
    },
  });
});
