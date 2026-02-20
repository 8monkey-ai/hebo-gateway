import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { bedrockAnthropicReasoningMiddleware } from "./middleware";

test("bedrockAnthropicReasoningMiddleware > matching provider", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "bedrock",
  });

  expect(middleware).toContain(bedrockAnthropicReasoningMiddleware);
});

test("bedrockAnthropicReasoningMiddleware > should map thinking/effort into reasoningConfig", async () => {
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

  const result = await bedrockAnthropicReasoningMiddleware.transformParams!({
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

test("bedrockAnthropicReasoningMiddleware > should skip non-anthropic models", async () => {
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

  const result = await bedrockAnthropicReasoningMiddleware.transformParams!({
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
