import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { groqServiceTierMiddleware } from "./middleware";

test("groq middlewares > matching provider resolves service tier middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    providerId: "groq.chat",
  });

  expect(middleware).toContain(groqServiceTierMiddleware);
});

const groqServiceTierCases = [
  { tier: "auto", expected: "auto" },
  { tier: "default", expected: "on_demand" },
  { tier: "flex", expected: "flex" },
  { tier: "scale", expected: "performance" },
  { tier: "priority", expected: "performance" },
] as const;

for (const { tier, expected } of groqServiceTierCases) {
  test(`groqServiceTierMiddleware > should map ${tier} to ${expected}`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        groq: {
          serviceTier: tier,
        },
      },
    };

    const result = await groqServiceTierMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-20b" }),
    });

    expect(result.providerOptions!["groq"]).toEqual({
      serviceTier: expected,
    });
  });
}
