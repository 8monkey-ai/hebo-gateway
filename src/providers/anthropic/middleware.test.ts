import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { anthropicServiceTierMiddleware } from "./middleware";

test("anthropic middlewares > matching provider resolves the service tier middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "anthropic.messages",
  });

  expect(middleware).toContain(anthropicServiceTierMiddleware);
});

// Anthropic serves `auto` and `standard_only`; the rest has no equivalent and used to fail
// the provider-options schema with `invalid anthropic provider options`.
const serviceTierCases = [
  { tier: "auto", expected: "auto" },
  { tier: "default", expected: "standard_only" },
  { tier: "flex", expected: undefined },
  { tier: "priority", expected: undefined },
  { tier: "scale", expected: undefined },
] as const;

for (const { tier, expected } of serviceTierCases) {
  test(`anthropicServiceTierMiddleware > should map ${tier} tier`, async () => {
    const result = await anthropicServiceTierMiddleware.transformParams!({
      type: "generate",
      params: { prompt: [], providerOptions: { anthropic: { serviceTier: tier } } },
      model: new MockLanguageModelV4({ modelId: "claude-opus-4-6" }),
    });

    expect(result.providerOptions!["anthropic"]!["serviceTier"]).toBe(expected);
  });
}

test("anthropicServiceTierMiddleware > should ignore non-object provider options", async () => {
  const result = await anthropicServiceTierMiddleware.transformParams!({
    type: "generate",
    // Wire-supplied provider options are passed through unchanged by the forward middleware.
    params: { prompt: [], providerOptions: { anthropic: 5 as never } },
    model: new MockLanguageModelV4({ modelId: "claude-opus-4-6" }),
  });

  expect(result.providerOptions!["anthropic"]).toBe(5 as never);
});
