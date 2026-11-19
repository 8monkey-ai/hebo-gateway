import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { deepseekReasoningMiddleware } from "./middleware.ts";

test("deepseek middleware > matches every DeepSeek model", () => {
  for (const id of ["deepseek/deepseek-v4-pro", "deepseek/deepseek-v5"]) {
    expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: id })).toContain(
      deepseekReasoningMiddleware(),
    );
  }
});

const optionsOf = async (spec: ModelSpec, reasoning: JSONObject) =>
  (await transform(deepseekReasoningMiddleware(spec), withReasoning(reasoning))).providerOptions;

const V4: ModelSpec = { reasoning: { toggle: true, effort: ["low", "high", "max"] } };

describe("deepseekReasoningMiddleware", () => {
  test.each([
    ["low", "low"],
    ["medium", "high"],
    ["xhigh", "max"],
    ["max", "max"],
  ] as const)("maps %s to the %s thinking strength", async (effort, expected) => {
    expect(await optionsOf(V4, { enabled: true, effort })).toEqual({
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: expected },
      unknown: {},
    });
  });

  test.each([{ enabled: false }, { enabled: false, effort: "none" }])(
    "turns thinking off (%o)",
    async (reasoning) => {
      expect(await optionsOf(V4, reasoning)).toEqual({
        deepseek: { thinking: { type: "disabled" } },
        unknown: {},
      });
    },
  );

  test("only sends what the model takes", async () => {
    // e.g. DeepSeek V4 Flash on Chutes: a toggle only.
    expect(
      await optionsOf({ reasoning: { toggle: true } }, { enabled: true, effort: "high" }),
    ).toEqual({
      deepseek: { thinking: { type: "enabled" } },
      unknown: {},
    });
    // e.g. DeepSeek V4.1 Flash on Together: effort levels with `none`.
    expect(
      await optionsOf(
        { reasoning: { effort: ["none", "low", "high", "max"] } },
        { enabled: false },
      ),
    ).toEqual({ deepseek: { reasoningEffort: "none" }, unknown: {} });
  });

  test("leaves requests without reasoning untouched", async () => {
    expect((await transform(deepseekReasoningMiddleware(V4), {})).providerOptions).toBeUndefined();
    expect(
      (await transform(deepseekReasoningMiddleware(V4), { providerOptions: { unknown: {} } }))
        .providerOptions,
    ).toEqual({ unknown: {} });
  });
});
