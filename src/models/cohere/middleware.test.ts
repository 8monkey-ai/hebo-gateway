import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { cohereDimensionsMiddleware, cohereReasoningMiddleware } from "./middleware.ts";

test("cohere middleware > matching patterns", () => {
  for (const id of ["cohere/command-a-reasoning-08-2025", "cohere/north-mini-code-1-0"]) {
    expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: id })).toContain(
      cohereReasoningMiddleware(),
    );
  }

  expect(
    modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: "cohere/embed-v4.0" }),
  ).toContain(cohereDimensionsMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: "cohere/command-a-03-2025" }),
  ).not.toContain(cohereDimensionsMiddleware);
});

const thinkingOf = async (spec: ModelSpec, reasoning: JSONObject, maxOutputTokens?: number) =>
  (await transform(cohereReasoningMiddleware(spec), withReasoning(reasoning, { maxOutputTokens })))
    .providerOptions?.["cohere"]?.["thinking"];

const COMMAND_A: ModelSpec = { output: 32_000, reasoning: { toggle: true, budget: { min: 1 } } };

describe("cohereReasoningMiddleware", () => {
  test("computes the budget from the effort", async () => {
    expect(await thinkingOf(COMMAND_A, { enabled: true, effort: "medium" }, 10_000)).toEqual({
      type: "enabled",
      tokenBudget: 5000,
    });
    expect(await thinkingOf(COMMAND_A, { enabled: true, effort: "high" })).toEqual({
      type: "enabled",
      tokenBudget: 25_600,
    });
  });

  test("takes max_tokens as the budget", async () => {
    expect(await thinkingOf(COMMAND_A, { enabled: true, max_tokens: 2000 })).toEqual({
      type: "enabled",
      tokenBudget: 2000,
    });
  });

  test.each([{ enabled: false }, { enabled: false, effort: "none" }])(
    "turns thinking off (%o)",
    async (reasoning) => {
      expect(await thinkingOf(COMMAND_A, reasoning)).toEqual({ type: "disabled" });
    },
  );

  test("sends a plain toggle to models without a budget", async () => {
    expect(
      await thinkingOf({ reasoning: { toggle: true } }, { enabled: true, effort: "high" }),
    ).toEqual({
      type: "enabled",
    });
  });

  test("drops reasoning for models that don't reason", async () => {
    const result = await transform(
      cohereReasoningMiddleware({ reasoning: false }),
      withReasoning({ enabled: true, effort: "high" }),
    );
    expect(result.providerOptions).toEqual({ unknown: {} });
  });
});
