import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { moonshotReasoningMiddleware } from "./middleware.ts";

test("moonshot middlewares > matching model resolves reasoning middleware", () => {
  expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: "moonshotai/kimi-k3" })).toContain(
    moonshotReasoningMiddleware,
  );
});

const optionsOf = async (spec: ModelSpec, reasoning: JSONObject) =>
  (await transform(moonshotReasoningMiddleware, withReasoning(reasoning), { spec }))
    .providerOptions;

// Kimi K2.6 takes a thinking toggle, K3 effort levels.
const K2_6: ModelSpec = { reasoning: { toggle: true } };
const K3: ModelSpec = { reasoning: { effort: ["low", "high", "max"] } };

describe("moonshotReasoningMiddleware", () => {
  test("toggles thinking on models that take a toggle", async () => {
    expect(await optionsOf(K2_6, { enabled: true, effort: "high", max_tokens: 1000 })).toEqual({
      moonshotai: { thinking: { type: "enabled" } },
      unknown: {},
    });
    expect(await optionsOf(K2_6, { enabled: false })).toEqual({
      moonshotai: { thinking: { type: "disabled" } },
      unknown: {},
    });
  });

  test("maps the effort on models that take effort levels", async () => {
    expect(await optionsOf(K3, { enabled: true, effort: "medium" })).toEqual({
      moonshotai: { reasoningEffort: "high" },
      unknown: {},
    });
    expect(await optionsOf(K3, { enabled: false })).toEqual({
      moonshotai: { reasoningEffort: "low" },
      unknown: {},
    });
  });

  test("drops reasoning for models without controls", async () => {
    // e.g. Kimi K2.7 Code, which always thinks.
    expect(await optionsOf({ reasoning: {} }, { enabled: false })).toEqual({ unknown: {} });
  });

  test("leaves requests without reasoning untouched", async () => {
    expect(
      (
        await transform(
          moonshotReasoningMiddleware,
          { providerOptions: { unknown: {} } },
          { spec: K3 },
        )
      ).providerOptions,
    ).toEqual({ unknown: {} });
  });
});
