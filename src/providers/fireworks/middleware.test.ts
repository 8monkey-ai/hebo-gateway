import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../../models/types.ts";
import { fireworksReasoningMiddleware } from "./middleware.ts";

test("fireworks middlewares > matching provider resolves reasoning middleware", () => {
  expect(modelMiddlewareMatcher.resolve({ kind: "text", providerId: "fireworks" })).toContain(
    fireworksReasoningMiddleware(),
  );
});

const fireworksOf = async (spec: ModelSpec, reasoning: JSONObject, maxOutputTokens?: number) =>
  (
    await transform(fireworksReasoningMiddleware(spec), {
      maxOutputTokens,
      providerOptions: { fireworks: { reasoning } },
    })
  ).providerOptions?.["fireworks"];

describe("fireworksReasoningMiddleware", () => {
  const budget: ModelSpec = { reasoning: { toggle: true, budget: {} } };

  test("enables thinking with a budget from the effort, or max_tokens", async () => {
    expect(await fireworksOf(budget, { enabled: true, effort: "medium" }, 16_384)).toEqual({
      thinking: { type: "enabled", budgetTokens: 8192 },
    });
    expect(await fireworksOf(budget, { enabled: true, max_tokens: 4096 })).toEqual({
      thinking: { type: "enabled", budgetTokens: 4096 },
    });
  });

  test("turns thinking off", async () => {
    expect(await fireworksOf(budget, { enabled: false })).toEqual({
      thinking: { type: "disabled" },
    });
  });

  test("maps the effort on models that take effort levels", async () => {
    const effort: ModelSpec = { reasoning: { effort: ["low", "high", "max"] } };
    expect(await fireworksOf(effort, { enabled: true, effort: "medium" })).toEqual({
      reasoningEffort: "high",
    });
  });

  test("toggles thinking on models without a spec", async () => {
    expect(await fireworksOf({}, { enabled: true, effort: "high" })).toEqual({
      thinking: { type: "enabled" },
    });
  });

  test("passes through when no reasoning", async () => {
    const result = await transform(fireworksReasoningMiddleware(), {
      providerOptions: { fireworks: { promptCacheKey: "k" } },
    });
    expect(result.providerOptions?.["fireworks"]).toEqual({ promptCacheKey: "k" });
  });
});
