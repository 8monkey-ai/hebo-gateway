import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

test("geminiReasoningMiddleware > should enable thinking for effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const [gemini3Flash] = modelMiddlewareMatcher.for("google/gemini-3-flash-preview", "google");

  const result = await gemini3Flash.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
        reasoningEffort: "medium",
      },
      unknown: {},
    },
  });
});
