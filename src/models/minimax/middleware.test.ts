import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { minimaxReasoningMiddleware } from "./middleware";

test("minimax middlewares > matching model resolves reasoning middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "minimax/m2.7",
  });

  expect(middleware).toContain(minimaxReasoningMiddleware);
});

const reasoningEffortCases = [
  { effort: "none", expected: undefined },
  { effort: "minimal", expected: "low" },
  { effort: "low", expected: "low" },
  { effort: "medium", expected: "medium" },
  { effort: "high", expected: "high" },
  { effort: "xhigh", expected: "high" },
  { effort: "max", expected: "high" },
] as const;

for (const { effort, expected } of reasoningEffortCases) {
  test(`minimaxReasoningMiddleware > should map effort ${effort} to ${expected}`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        unknown: {
          reasoning: { enabled: true, effort },
        },
      },
    };

    const result = await minimaxReasoningMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV3({ modelId: "minimax/m2.7" }),
    });

    expect(result.providerOptions!["unknown"]).toEqual({
      reasoning_effort: expected,
    });
  });
}

test("minimaxReasoningMiddleware > should map enabled:false to effort none", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await minimaxReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "minimax/m2.7" }),
  });

  expect(result.providerOptions!["unknown"]).toEqual({
    reasoning_effort: "none",
  });
});

test("minimaxReasoningMiddleware > should pass through when no reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        service_tier: "priority",
      },
    },
  };

  const result = await minimaxReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "minimax/m2.5" }),
  });

  expect(result.providerOptions!["unknown"]).toEqual({
    service_tier: "priority",
  });
});
