import { describe, expect, test } from "bun:test";

import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";

import { bundledSpecs } from "../../test/helpers/catalog.ts";
import { REASONING_EFFORTS, type ReasoningControls } from "../models/types.ts";
import { nearestEffort, reasoningControls, resolveReasoning, takeReasoning } from "./reasoning.ts";

describe("nearestEffort", () => {
  test.each([
    ["high", ["low", "medium", "high"], "high"],
    ["xhigh", ["low", "medium", "high"], "high"],
    ["max", ["low", "medium", "high", "xhigh"], "xhigh"],
    ["minimal", ["low", "medium", "high"], "low"],
    // Ties go up.
    ["xhigh", ["low", "medium", "high", "max"], "max"],
    ["medium", ["low", "high", "max"], "high"],
    ["minimal", ["none", "low", "high"], "low"],
    // `none` is never picked for another effort.
    ["low", ["none", "high"], "high"],
  ] as const)("%s on %j -> %s", (effort, levels, expected) => {
    expect(nearestEffort(effort, levels)).toBe(expected);
  });
});

describe("resolveReasoning", () => {
  const effort: ReasoningControls = { effort: ["low", "medium", "high"] };
  const withNone: ReasoningControls = { effort: ["none", "low", "medium", "high"] };
  const toggle: ReasoningControls = { toggle: true, effort: ["low", "high"] };
  const budget: ReasoningControls = { toggle: true, budget: { min: 1024 } };

  test("turns reasoning off through the toggle, then `none`, then the lowest effort", () => {
    const off = { enabled: false, effort: "none" } as const;
    expect(resolveReasoning(off, toggle)).toEqual({ enabled: false });
    expect(resolveReasoning(off, withNone)).toEqual({ enabled: false, effort: "none" });
    expect(resolveReasoning(off, effort)).toEqual({ enabled: true, effort: "low" });
    expect(resolveReasoning(off, { budget: {} })).toBeUndefined();
  });

  test("maps the effort to the nearest level", () => {
    expect(resolveReasoning({ enabled: true, effort: "max" }, effort)).toEqual({
      enabled: true,
      effort: "high",
    });
    expect(resolveReasoning({}, effort)).toEqual({ enabled: true });
  });

  test("computes a budget from the effort, or takes max_tokens, within limits", () => {
    expect(resolveReasoning({ enabled: true, effort: "medium" }, budget, 10_000)).toEqual({
      enabled: true,
      budget: 5000,
    });
    expect(resolveReasoning({ enabled: true, effort: "low" }, budget, 2000)).toEqual({
      enabled: true,
      budget: 1024,
    });
    expect(resolveReasoning({ enabled: true, max_tokens: 50_000 }, budget, 10_000)).toEqual({
      enabled: true,
      budget: 10_000,
    });
    expect(resolveReasoning({ enabled: true }, budget)).toEqual({ enabled: true });
  });

  // Golden check against the bundled models.dev data: whatever is requested, only what a model
  // lists is sent to it.
  test("only resolves to levels each bundled model lists", () => {
    const requests = [
      { enabled: false, effort: "none" as const },
      ...REASONING_EFFORTS.filter((e) => e !== "none").map((e) => ({ enabled: true, effort: e })),
    ];

    for (const [id, provider, spec] of bundledSpecs()) {
      const controls = spec.reasoning ? reasoningControls(spec, {}) : undefined;
      if (!controls) continue;
      for (const request of requests) {
        const resolved = resolveReasoning(request, controls);
        if (resolved?.effort === undefined) continue;
        expect({ id, provider, effort: resolved.effort, listed: true }).toEqual({
          id,
          provider,
          effort: resolved.effort,
          listed: controls.effort!.includes(resolved.effort),
        });
      }
    }
  });
});

describe("reasoningControls", () => {
  const fallback: ReasoningControls = { effort: ["low", "high"] };

  test("falls back for unknown models and drops models without controls", () => {
    expect(reasoningControls({}, fallback)).toBe(fallback);
    expect(reasoningControls({ reasoning: false }, fallback)).toBeUndefined();
    expect(reasoningControls({ reasoning: {} }, fallback)).toBeUndefined();
    expect(reasoningControls({ reasoning: { toggle: true } }, fallback)).toEqual({ toggle: true });
  });
});

test("takeReasoning > removes reasoning and reasoning_effort from the unknown options", () => {
  const params: LanguageModelV4CallOptions = {
    prompt: [],
    providerOptions: { unknown: { reasoning: { effort: "high" }, reasoning_effort: "high", x: 1 } },
  };
  expect(takeReasoning(params)).toEqual({ effort: "high" });
  expect(params.providerOptions!["unknown"]).toEqual({ x: 1 });
  expect(takeReasoning({ prompt: [] })).toBeUndefined();
});
