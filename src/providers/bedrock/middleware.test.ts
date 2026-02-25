import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import {
  bedrockClaudeReasoningMiddleware,
  bedrockGptReasoningMiddleware,
  bedrockPromptCachingMiddleware,
} from "./middleware";

test("bedrock middlewares > matching provider resolves GPT middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "openai/gpt-oss-20b",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockGptReasoningMiddleware);
});

test("bedrock middlewares > matching provider resolves Claude middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockClaudeReasoningMiddleware);
});

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

  expect(result.providerOptions?.bedrock).toEqual({
    reasoningConfig: {
      maxReasoningEffort: "high",
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

  expect(result.providerOptions?.bedrock).toEqual({
    reasoningEffort: "medium",
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

  expect(result.providerOptions?.bedrock).toEqual({
    reasoningConfig: {
      type: "adaptive",
      budgetTokens: 4096,
      maxReasoningEffort: "max",
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

  expect(result.providerOptions?.bedrock).toEqual({
    thinking: {
      type: "enabled",
      budgetTokens: 4096,
    },
    effort: "high",
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

  expect(result.providerOptions?.bedrock).toEqual({
    reasoningConfig: {
      type: "enabled",
      budgetTokens: 4096,
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

  expect(result.providerOptions?.bedrock).toEqual({
    reasoningConfig: {
      type: "enabled",
      budgetTokens: 4096,
    },
  });
});

test("bedrockPromptCachingMiddleware > should map message and part cacheControl to cachePoint", async () => {
  const params = {
    prompt: [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "Policy",
            providerOptions: {
              unknown: {
                cacheControl: { type: "ephemeral", ttl: "1h" },
              },
            },
          },
        ],
        providerOptions: {
          unknown: {
            cacheControl: { type: "ephemeral", ttl: "5m" },
          },
        },
      },
    ],
    providerOptions: {
      unknown: {},
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params as any,
    model: new MockLanguageModelV3({ modelId: "amazon/nova-2-lite" }),
  });

  expect((result.prompt[0] as any).providerOptions.unknown.cachePoint).toEqual({
    type: "default",
    ttl: "5m",
  });
  expect((result.prompt[0] as any).providerOptions.unknown.cacheControl).toBeUndefined();
  expect((result.prompt[0] as any).content[0].providerOptions.unknown.cachePoint).toEqual({
    type: "default",
    ttl: "5m",
  });
  expect((result.prompt[0] as any).content[0].providerOptions.unknown.cacheControl).toBeUndefined();
});

test("bedrockPromptCachingMiddleware > should fallback from top-level cacheControl", async () => {
  const params = {
    prompt: [
      {
        role: "system",
        content: "Reusable context",
      },
      {
        role: "user",
        content: "Question",
      },
    ],
    providerOptions: {
      unknown: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params as any,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect((result.prompt[0] as any).providerOptions.unknown.cachePoint).toEqual({
    type: "default",
    ttl: "1h",
  });
  expect((result.providerOptions as any).unknown.cacheControl).toBeUndefined();
});

test("bedrockPromptCachingMiddleware > should skip non-claude non-nova models", async () => {
  const params = {
    prompt: [{ role: "user", content: "Hello" }],
    providerOptions: {
      unknown: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params as any,
    model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-20b" }),
  });

  expect((result.providerOptions as any).unknown.cacheControl).toEqual({
    type: "ephemeral",
    ttl: "1h",
  });
  expect((result.prompt[0] as any).providerOptions).toBeUndefined();
});
