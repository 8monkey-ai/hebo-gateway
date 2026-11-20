import { describe, expect, test } from "bun:test";

import type { JSONObject } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";

import { bundledSpecs } from "../../../test/helpers/catalog.ts";
import { transform, withReasoning } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import type { ModelSpec } from "../types.ts";
import { claudePromptCachingMiddleware, claudeReasoningMiddleware } from "./middleware.ts";

test("claude middleware > matches every Claude model", () => {
  for (const id of [
    "anthropic/claude-opus-5-5",
    "anthropic/claude-sonnet-4-6",
    "anthropic/claude-opus-7",
  ]) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(claudeReasoningMiddleware);
    expect(middleware).toContain(claudePromptCachingMiddleware);
  }
});

test("claudePromptCachingMiddleware > should not auto-enable top-level cache control", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {},
    },
  };

  const result = await claudePromptCachingMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-sonnet-4-6" }),
  });

  expect(result.providerOptions).toEqual({
    unknown: {},
  });
});

test("claudePromptCachingMiddleware > should map cache_control ttl", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await claudePromptCachingMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-sonnet-4-6" }),
  });

  expect(result.providerOptions).toEqual({
    anthropic: {
      cacheControl: { type: "ephemeral", ttl: "1h" },
    },
    unknown: {},
  });
});

test("claudePromptCachingMiddleware > should clamp the 24h retention ttl", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      // OpenAI's `prompt_cache_retention: "24h"` normalizes to this; Claude serves 5m / 1h.
      unknown: {
        cache_control: { type: "ephemeral", ttl: "24h" },
      },
    },
  };

  const result = await claudePromptCachingMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-sonnet-4-6" }),
  });

  expect(result.providerOptions).toEqual({
    anthropic: {
      cacheControl: { type: "ephemeral", ttl: "1h" },
    },
    unknown: {},
  });
});

// Claude Opus 4.6 / Sonnet 4.6: effort levels without `xhigh`, and a thinking budget.
const OPUS_4_6: ModelSpec = {
  output: 128_000,
  reasoning: { effort: ["low", "medium", "high", "max"], budget: { min: 1024 } },
};
// Claude Opus 4.7 and later: native effort levels, adaptive thinking only.
const OPUS_5: ModelSpec = {
  output: 128_000,
  reasoning: { effort: ["low", "medium", "high", "xhigh", "max"] },
};

const anthropicOptions = async (spec: ModelSpec, reasoning: JSONObject, maxOutputTokens?: number) =>
  (
    await transform(claudeReasoningMiddleware, withReasoning(reasoning, { maxOutputTokens }), {
      spec: spec,
    })
  ).providerOptions;

describe("claudeReasoningMiddleware", () => {
  test.each([
    ["xhigh", OPUS_4_6, "max"],
    ["max", OPUS_4_6, "max"],
    ["minimal", OPUS_4_6, "low"],
    ["medium", OPUS_4_6, "medium"],
    ["xhigh", OPUS_5, "xhigh"],
    ["max", OPUS_5, "max"],
  ] as const)("maps %s to the nearest effort the model lists", async (effort, spec, expected) => {
    expect(await anthropicOptions(spec, { enabled: true, effort })).toEqual({
      anthropic: { effort: expected, thinking: { type: "adaptive" } },
      unknown: {},
    });
  });

  test("thinks adaptively, ignoring max_tokens, on models without a budget", async () => {
    expect(
      await anthropicOptions(OPUS_5, { enabled: true, effort: "high", max_tokens: 4000 }),
    ).toEqual({
      anthropic: { effort: "high", thinking: { type: "adaptive" } },
      unknown: {},
    });
  });

  test("takes max_tokens as the budget on models that take one, within the output limit", async () => {
    expect(
      await anthropicOptions(OPUS_4_6, { enabled: true, effort: "high", max_tokens: 4000 }),
    ).toEqual({
      anthropic: { effort: "high", thinking: { type: "enabled", budgetTokens: 4000 } },
      unknown: {},
    });
    expect(await anthropicOptions(OPUS_4_6, { enabled: true, max_tokens: 200_000 })).toEqual({
      anthropic: { thinking: { type: "enabled", budgetTokens: 128_000 } },
      unknown: {},
    });
    expect(await anthropicOptions(OPUS_4_6, { enabled: true, max_tokens: 500 }, 10_000)).toEqual({
      anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } },
      unknown: {},
    });
  });

  test.each([{ enabled: false }, { enabled: false, effort: "none" }])(
    "turns thinking off (%o)",
    async (reasoning) => {
      expect(await anthropicOptions(OPUS_5, reasoning)).toEqual({
        anthropic: { thinking: { type: "disabled" } },
        unknown: {},
      });
    },
  );

  test("thinks adaptively when enabled without effort", async () => {
    expect(await anthropicOptions(OPUS_5, {})).toEqual({
      anthropic: { thinking: { type: "adaptive" } },
      unknown: {},
    });
  });

  test("maps the summary to the thinking display", async () => {
    expect(
      await anthropicOptions(OPUS_5, { enabled: true, effort: "low", summary: "none" }),
    ).toEqual({
      anthropic: { effort: "low", thinking: { type: "adaptive", display: "omitted" } },
      unknown: {},
    });
    expect(await anthropicOptions(OPUS_5, { enabled: true, summary: "auto" })).toEqual({
      anthropic: { thinking: { type: "adaptive", display: "summarized" } },
      unknown: {},
    });
  });

  test("uses the current generation for models without a spec", async () => {
    expect(await anthropicOptions({}, { enabled: true, effort: "xhigh" })).toEqual({
      anthropic: { effort: "xhigh", thinking: { type: "adaptive" } },
      unknown: {},
    });
  });

  test("drops reasoning for models without reasoning controls", async () => {
    expect(await anthropicOptions({ reasoning: false }, { enabled: true, effort: "high" })).toEqual(
      {
        unknown: {},
      },
    );
  });

  test("leaves requests without reasoning untouched", async () => {
    const params = { prompt: [], providerOptions: { unknown: {} } };
    const result = await claudeReasoningMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV4(),
    });
    expect(result).toEqual({ prompt: [], providerOptions: { unknown: {} } });
  });

  // Why Claude 4.5 is left out of the catalog: it can't.
  test.each(bundledSpecs().filter(([id, , spec]) => id.startsWith("anthropic/") && spec.reasoning))(
    "%s can think adaptively on %s",
    async (_id, _provider, spec) => {
      const options = await anthropicOptions(spec, { enabled: true, effort: "high" });
      expect(options?.["anthropic"]?.["thinking"]).toEqual({ type: "adaptive" });
    },
  );
});
