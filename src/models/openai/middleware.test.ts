import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

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
    "openai/gpt-5.4",
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4-nano",
    "openai/gpt-5.4-pro",
    "openai/gpt-5.5",
    "openai/gpt-5.5-pro",
    "openai/gpt-6-astra",
    "openai/gpt-6-sol",
    "openai/gpt-6-luna",
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
    model: new MockLanguageModelV4({ modelId: "openai/gpt-5" }),
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
    model: new MockLanguageModelV4({ modelId: "openai/gpt-5" }),
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

// The GPT-6 line takes `max` as its own level above `xhigh`, so it must survive the mapping.
// `openai.gpt-6-astra` is how Bedrock Mantle names the same model, and this middleware runs
// there too: the matcher applies model- and provider-matched entries alike.
for (const modelId of [
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-6",
  "gpt-7",
  "openai/gpt-6-astra",
  "openai.gpt-6-astra",
]) {
  test(`openAIReasoningMiddleware > should keep max effort for ${modelId}`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        unknown: {
          reasoning: { enabled: true, effort: "max" },
        },
      },
    };

    const result = await openAIReasoningMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV4({ modelId }),
    });

    expect(result).toEqual({
      prompt: [],
      providerOptions: {
        openai: { reasoningEffort: "max" },
        unknown: {},
      },
    });
  });
}

// Earlier models have no `max`, so it has to come back down to `xhigh`.
for (const modelId of ["gpt-5", "gpt-5.1", "openai/gpt-5.6-sol"]) {
  test(`openAIReasoningMiddleware > should lower max effort to xhigh for ${modelId}`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        unknown: {
          reasoning: { enabled: true, effort: "max" },
        },
      },
    };

    const result = await openAIReasoningMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV4({ modelId }),
    });

    expect(result).toEqual({
      prompt: [],
      providerOptions: {
        openai: { reasoningEffort: "xhigh" },
        unknown: {},
      },
    });
  });
}

test("openAIReasoningMiddleware > should lower minimal effort to low on GPT-6", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "gpt-6-astra" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: { reasoningEffort: "low" },
      unknown: {},
    },
  });
});

test("openAIReasoningMiddleware > should keep minimal effort on GPT-5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "gpt-5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: { reasoningEffort: "minimal" },
      unknown: {},
    },
  });
});

// Sol and Luna are the only GPT-6 models that can turn reasoning off.
for (const modelId of ["gpt-6-sol", "gpt-6-luna"]) {
  test(`openAIReasoningMiddleware > should disable reasoning with none for ${modelId}`, async () => {
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
      model: new MockLanguageModelV4({ modelId }),
    });

    expect(result).toEqual({
      prompt: [],
      providerOptions: {
        openai: { reasoningEffort: "none" },
        unknown: {},
      },
    });
  });
}

// Astra has no `none`, so the request lands on the lowest effort it does offer instead of
// being dropped by the SDK and leaving reasoning at its default.
for (const reasoning of [{ enabled: false }, { enabled: true, effort: "none" }]) {
  test(`openAIReasoningMiddleware > should fall back to low on GPT-6 Astra for ${JSON.stringify(reasoning)}`, async () => {
    const params = {
      prompt: [],
      providerOptions: { unknown: { reasoning } },
    };

    const result = await openAIReasoningMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV4({ modelId: "gpt-6-astra" }),
    });

    expect(result).toEqual({
      prompt: [],
      providerOptions: {
        openai: { reasoningEffort: "low" },
        unknown: {},
      },
    });
  });
}

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
    model: new MockLanguageModelV4({ modelId: "openai/gpt-5" }),
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
    { reasoning: { enabled: false }, expected: undefined },
    { reasoning: { enabled: true }, expected: undefined },
    { reasoning: { enabled: true, effort: "none" }, expected: undefined },
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
        model: new MockLanguageModelV4({ modelId: "openai/gpt-oss-20b" }),
      });

      expect(result).toEqual({
        prompt: [],
        providerOptions: {
          openai: expected === undefined ? {} : { reasoningEffort: expected },
          unknown: {},
        },
      });
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
    model: new MockLanguageModelV4({ modelId: "openai/gpt-5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: {},
      unknown: {},
    },
  });
});
