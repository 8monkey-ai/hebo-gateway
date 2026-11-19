import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";

import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { novaDimensionsMiddleware, novaReasoningMiddleware } from "./middleware.ts";

test("nova middleware > matching patterns", () => {
  for (const id of ["amazon/nova-2-lite", "amazon/nova-3-pro"]) {
    expect(modelMiddlewareMatcher.resolve({ kind: "text", modelId: id })).toContain(
      novaReasoningMiddleware(),
    );
  }

  expect(
    modelMiddlewareMatcher.resolve({
      kind: "embedding",
      modelId: "amazon/nova-2-multimodal-embeddings",
    }),
  ).toContain(novaDimensionsMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: "amazon/nova-2-lite" }),
  ).not.toContain(novaDimensionsMiddleware);
});

const configOf = async (spec: ModelSpec, reasoning: JSONObject) =>
  (await transform(novaReasoningMiddleware(spec), withReasoning(reasoning))).providerOptions?.[
    "amazon"
  ]?.["reasoningConfig"];

const NOVA_2: ModelSpec = { reasoning: { toggle: true, effort: ["low", "medium", "high"] } };

describe("novaReasoningMiddleware", () => {
  test("maps the effort to the nearest maximum effort", async () => {
    expect(await configOf(NOVA_2, { enabled: true, effort: "max" })).toEqual({
      type: "enabled",
      maxReasoningEffort: "high",
    });
  });

  test("enables reasoning without effort", async () => {
    expect(await configOf(NOVA_2, { enabled: true, max_tokens: 1000 })).toEqual({
      type: "enabled",
    });
  });

  test("turns reasoning off", async () => {
    expect(await configOf(NOVA_2, { enabled: false })).toEqual({ type: "disabled" });
  });

  test("drops reasoning for models that don't reason", async () => {
    const result = await transform(
      novaReasoningMiddleware({ reasoning: false }),
      withReasoning({ enabled: true, effort: "high" }),
    );
    expect(result.providerOptions).toEqual({ unknown: {} });
  });
});
