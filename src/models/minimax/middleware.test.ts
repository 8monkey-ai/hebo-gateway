import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { minimaxReasoningMiddleware } from "./middleware.ts";

test("minimax middlewares > matching model resolves reasoning middleware", () => {
  expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: "minimax/MiniMax-M3" })).toContain(
    minimaxReasoningMiddleware,
  );
});

const optionsOf = async (spec: ModelSpec, reasoning: JSONObject) =>
  (await transform(minimaxReasoningMiddleware, withReasoning(reasoning), { spec })).providerOptions;

// MiniMax M3 takes a thinking toggle, M3.1 Flash effort levels.
const M3: ModelSpec = { reasoning: { toggle: true } };
const M3_1: ModelSpec = { reasoning: { effort: ["low", "medium", "high", "xhigh", "max"] } };

describe("minimaxReasoningMiddleware", () => {
  test.each([
    ["minimal", "low"],
    ["medium", "medium"],
    ["max", "max"],
  ] as const)("maps %s to %s", async (effort, expected) => {
    expect(await optionsOf(M3_1, { enabled: true, effort })).toEqual({
      unknown: { reasoning_effort: expected },
    });
  });

  test("turns thinking off with `none` on models that take a toggle", async () => {
    expect(await optionsOf(M3, { enabled: false })).toEqual({
      unknown: { reasoning_effort: "none" },
    });
    expect(await optionsOf(M3, { enabled: true, effort: "high" })).toEqual({ unknown: {} });
  });

  test("leaves requests without reasoning untouched", async () => {
    expect(
      (
        await transform(
          minimaxReasoningMiddleware,
          { providerOptions: { unknown: {} } },
          { spec: M3_1 },
        )
      ).providerOptions,
    ).toEqual({ unknown: {} });
  });
});
