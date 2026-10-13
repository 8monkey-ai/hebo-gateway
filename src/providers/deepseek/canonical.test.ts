import { expect, test } from "bun:test";

import { deepseek } from "@ai-sdk/deepseek";

import { withCanonicalIdsForDeepSeek } from "./canonical";

test("withCanonicalIdsForDeepSeek > strips namespace for deepseek-v4-pro", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);

  const model = provider.languageModel("deepseek/deepseek-v4-pro");
  expect(model.modelId).toBe("deepseek-v4-pro");
});

test("withCanonicalIdsForDeepSeek > supports extra mapping override", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek, {
    "deepseek/custom-model": "custom-native-id",
  });

  const model = provider.languageModel("deepseek/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
