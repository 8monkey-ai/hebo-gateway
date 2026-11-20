import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { xaiReasoningMiddleware } from "./middleware.ts";

test("xai middleware > matches every xAI model", () => {
  for (const id of ["xai/grok-4.3", "xai/grok-4.7", "xai/grok-5"]) {
    expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: id })).toContain(
      xaiReasoningMiddleware,
    );
  }
});

const effortOf = async (spec: ModelSpec, reasoning: JSONObject) => {
  const result = await transform(xaiReasoningMiddleware, withReasoning(reasoning), { spec });
  return result.providerOptions?.["xai"]?.["reasoningEffort"];
};

// models.dev effort levels of a few models.
const GROK_4_3: ModelSpec = { reasoning: { effort: ["none", "low", "medium", "high", "xhigh"] } };
const GROK_4_7: ModelSpec = { reasoning: { effort: ["low", "medium", "high", "xhigh"] } };
// The Grok 4.20 reasoning line rejects `reasoning_effort`.
const GROK_4_20: ModelSpec = { reasoning: {} };

describe("xaiReasoningMiddleware", () => {
  test.each([
    [GROK_4_7, "minimal", "low"],
    [GROK_4_7, "medium", "medium"],
    [GROK_4_7, "max", "xhigh"],
    [{ reasoning: { effort: ["low", "medium", "high"] } }, "xhigh", "high"],
  ] as const)("maps to an effort the model lists (%#)", async (spec, effort, expected) => {
    expect(await effortOf(spec, { enabled: true, effort })).toBe(expected);
  });

  test("turns reasoning off with `none`, or the lowest effort when the model can't", async () => {
    expect(await effortOf(GROK_4_3, { enabled: false })).toBe("none");
    expect(await effortOf(GROK_4_7, { enabled: false, effort: "none" })).toBe("low");
  });

  test("sends no effort to models that take none", async () => {
    const result = await transform(
      xaiReasoningMiddleware,
      withReasoning({ enabled: true, effort: "high" }),
      { spec: GROK_4_20 },
    );
    expect(result.providerOptions).toEqual({ unknown: {} });
  });

  test("uses the current generation for models without a spec", async () => {
    expect(await effortOf({}, { enabled: true, effort: "max" })).toBe("xhigh");
  });
});
