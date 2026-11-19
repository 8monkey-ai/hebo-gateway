import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { qwenReasoningMiddleware } from "./middleware.ts";

test("qwenReasoningMiddleware > matches every Alibaba model", () => {
  for (const id of ["alibaba/qwen3.6-plus", "alibaba/qwen4-max"]) {
    expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: id })).toContain(
      qwenReasoningMiddleware(),
    );
  }
});

const optionsOf = async (spec: ModelSpec, reasoning: JSONObject, maxOutputTokens?: number) =>
  (await transform(qwenReasoningMiddleware(spec), withReasoning(reasoning, { maxOutputTokens })))
    .providerOptions;

const QWEN: ModelSpec = { output: 65_536, reasoning: { toggle: true, budget: {} } };

describe("qwenReasoningMiddleware", () => {
  test.each([
    ["minimal", 6553],
    ["low", 13_107],
    ["medium", 32_768],
    ["high", 52_428],
    ["max", 65_536],
  ] as const)("computes the %s budget from the output limit", async (effort, budget) => {
    expect(await optionsOf(QWEN, { enabled: true, effort })).toEqual({
      alibaba: { enableThinking: true, thinkingBudget: budget },
      unknown: {},
    });
  });

  test("prefers max_tokens, then the request's output limit", async () => {
    expect(await optionsOf(QWEN, { enabled: true, max_tokens: 2048 })).toEqual({
      alibaba: { enableThinking: true, thinkingBudget: 2048 },
      unknown: {},
    });
    expect(await optionsOf(QWEN, { enabled: true, effort: "medium" }, 8192)).toEqual({
      alibaba: { enableThinking: true, thinkingBudget: 4096 },
      unknown: {},
    });
  });

  test("enables thinking without a budget when none is asked for", async () => {
    expect(await optionsOf(QWEN, {})).toEqual({ alibaba: { enableThinking: true }, unknown: {} });
  });

  test.each([{ enabled: false }, { enabled: false, effort: "none" }])(
    "turns thinking off (%o)",
    async (reasoning) => {
      expect(await optionsOf(QWEN, reasoning)).toEqual({
        alibaba: { enableThinking: false },
        unknown: {},
      });
    },
  );

  test("leaves requests without reasoning untouched", async () => {
    const params = { providerOptions: { unknown: {}, alibaba: { enableThinking: true } } };
    expect((await transform(qwenReasoningMiddleware(QWEN), params)).providerOptions).toEqual(
      params.providerOptions,
    );
  });
});
