import { expect, test } from "bun:test";

import { type LanguageModelV3CallOptions, type LanguageModelV3TextPart } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import {
  bedrockClaudeReasoningMiddleware,
  bedrockGptReasoningMiddleware,
  bedrockPromptCachingMiddleware,
  bedrockServiceTierMiddleware,
} from "./middleware";

test("bedrock middlewares > matching provider resolves GPT middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "openai/gpt-oss-20b",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockGptReasoningMiddleware);
  expect(middleware).toContain(bedrockServiceTierMiddleware);
});

test("bedrock middlewares > matching provider resolves Claude middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockClaudeReasoningMiddleware);
  expect(middleware).toContain(bedrockServiceTierMiddleware);
});

const bedrockServiceTierCases = [
  { tier: "auto", expected: {} },
  { tier: "default", expected: { serviceTier: "default" } },
  { tier: "flex", expected: { serviceTier: "flex" } },
  { tier: "priority", expected: { serviceTier: "priority" } },
  { tier: "scale", expected: { serviceTier: "reserved" } },
] as const;

for (const { tier, expected } of bedrockServiceTierCases) {
  test(`bedrockServiceTierMiddleware > should map ${tier} tier`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        bedrock: {
          serviceTier: tier,
        },
      },
    };

    const result = await bedrockServiceTierMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV3({ modelId: "amazon/nova-2-lite" }),
    });

    expect(result.providerOptions!["bedrock"]).toEqual(expected);
  });
}

test("bedrock middlewares > matching provider resolves prompt caching middleware for Claude", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockPromptCachingMiddleware);
});

test("bedrock middlewares > matching provider resolves prompt caching middleware for Nova", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "amazon/nova-2-lite",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockPromptCachingMiddleware);
});

test("bedrockGptReasoningMiddleware > should map reasoningEffort into reasoningConfig", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningEffort: "high",
      },
    },
  };

  const result = await bedrockGptReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-20b" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          maxReasoningEffort: "high",
        },
      },
    },
  });
});

test("bedrockGptReasoningMiddleware > should skip non-gpt models", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningEffort: "medium",
      },
    },
  };

  const result = await bedrockGptReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningEffort: "medium",
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should map thinking/effort into reasoningConfig", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "adaptive",
          budgetTokens: 4096,
        },
        effort: "max",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4-6" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
          budgetTokens: 4096,
          maxReasoningEffort: "max",
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should skip non-claude models", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-20b" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should not set maxReasoningEffort for Claude 3.x", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-3.7" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "enabled",
          budgetTokens: 4096,
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should not set maxReasoningEffort for Claude 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "enabled",
          budgetTokens: 4096,
        },
      },
    },
  });
});

test("bedrockPromptCachingMiddleware > should map message and part cacheControl to cachePoint", async () => {
  const params: LanguageModelV3CallOptions = {
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Policy",
            providerOptions: {
              bedrock: {
                cacheControl: { type: "ephemeral", ttl: "1h" },
              },
            },
          },
        ],
        providerOptions: {
          bedrock: {
            cacheControl: { type: "ephemeral", ttl: "1h" },
          },
        },
      },
    ],
    providerOptions: {
      bedrock: {},
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params,
    model: new MockLanguageModelV3({ modelId: "amazon/nova-2-lite" }),
  });

  expect(result).toEqual({
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Policy",
            providerOptions: {
              bedrock: {
                cachePoint: { type: "default" },
              },
            },
          } satisfies LanguageModelV3TextPart,
        ],
        providerOptions: {
          bedrock: {
            cachePoint: { type: "default" },
          },
        },
      },
    ],
    providerOptions: {
      bedrock: {},
    },
  });
});

test("bedrockPromptCachingMiddleware > should fallback from top-level cacheControl", async () => {
  const params: LanguageModelV3CallOptions = {
    prompt: [
      {
        role: "system",
        content: "Reusable context",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Question",
          },
        ],
      },
    ],
    providerOptions: {
      bedrock: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result).toEqual({
    prompt: [
      {
        role: "system",
        content: "Reusable context",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Question",
          } satisfies LanguageModelV3TextPart,
        ],
        providerOptions: {
          bedrock: {
            cachePoint: { type: "default", ttl: "1h" },
          },
        },
      },
    ],
    providerOptions: {
      bedrock: {},
    },
  });
});

test("bedrockPromptCachingMiddleware > should skip non-claude non-nova models", async () => {
  const params: LanguageModelV3CallOptions = {
    prompt: [{ role: "system", content: "Hello" }],
    providerOptions: {
      bedrock: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-20b" }),
  });

  expect(result).toEqual({
    prompt: [{ role: "system", content: "Hello" }],
    providerOptions: {
      bedrock: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  });
});
