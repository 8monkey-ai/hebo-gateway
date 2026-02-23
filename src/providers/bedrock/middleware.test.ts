import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { bedrockClaudeReasoningMiddleware, bedrockGptReasoningMiddleware } from "./middleware";

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
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
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
