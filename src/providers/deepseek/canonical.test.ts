import { expect, test } from "bun:test";

import { deepseek } from "@ai-sdk/deepseek";

import { withCanonicalIdsForDeepSeek } from "./canonical";

test("withCanonicalIdsForDeepSeek > strips namespace for deepseek-v4-pro", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);

  const model = provider.languageModel("deepseek/deepseek-v4-pro");
  expect(model.modelId).toBe("deepseek-v4-pro");
});

test("withCanonicalIdsForDeepSeek > maps deepseek-v4.1-flash to the flash alias", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);

  const model = provider.languageModel("deepseek/deepseek-v4.1-flash");
  expect(model.modelId).toBe("deepseek-flash");
});

test("withCanonicalIdsForDeepSeek > supports extra mapping override", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek, {
    "deepseek/custom-model": "custom-native-id",
  });

  const model = provider.languageModel("deepseek/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
