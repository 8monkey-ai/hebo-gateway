import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { moonshotReasoningMiddleware } from "./middleware";

test("moonshot middlewares > matching model resolves reasoning middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "moonshot/kimi-k2.5",
  });

  expect(middleware).toContain(moonshotReasoningMiddleware);
});

test("moonshotReasoningMiddleware > should enable thinking without forwarding unsupported max_tokens", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, max_tokens: 8192 },
      },
    },
  };

  const result = await moonshotReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "moonshot/kimi-k2.5" }),
  });

  expect(result.providerOptions!["moonshotai"]).toEqual({
    thinking: { type: "enabled" },
  });
  expect(result.providerOptions!["unknown"]).toEqual({});
});

test("moonshotReasoningMiddleware > should enable thinking without forwarding unsupported effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 16384,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await moonshotReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "moonshot/kimi-k2.5" }),
  });

  expect(result.providerOptions!["moonshotai"]).toEqual({
    thinking: { type: "enabled" },
  });
  expect(result.providerOptions!["unknown"]).toEqual({});
});

test("moonshotReasoningMiddleware > should map enabled:false to disabled thinking", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await moonshotReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "moonshot/kimi-k2.6" }),
  });

  expect(result.providerOptions!["moonshotai"]).toEqual({
    thinking: { type: "disabled" },
  });
  expect(result.providerOptions!["unknown"]).toEqual({});
});

test("moonshotReasoningMiddleware > should pass through when no reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        service_tier: "priority",
      },
    },
  };

  const result = await moonshotReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "moonshot/kimi-k2.5" }),
  });

  expect(result.providerOptions!["unknown"]).toEqual({
    service_tier: "priority",
  });
});
