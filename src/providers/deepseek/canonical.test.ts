import { expect, test } from "bun:test";

import { deepseek } from "@ai-sdk/deepseek";

import { withCanonicalIdsForDeepSeek } from "./canonical";

test("withCanonicalIdsForDeepSeek > maps deepseek-v3.2 to deepseek-chat", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);

  const model = provider.languageModel("deepseek/deepseek-v3.2");
  expect(model.modelId).toBe("deepseek-chat");
});

test("withCanonicalIdsForDeepSeek > strips namespace for deepseek-v4-pro", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);

  const model = provider.languageModel("deepseek/deepseek-v4-pro");
  expect(model.modelId).toBe("deepseek-v4-pro");
});

test("withCanonicalIdsForDeepSeek > strips namespace for deepseek-v4-flash", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);

  const model = provider.languageModel("deepseek/deepseek-v4-flash");
  expect(model.modelId).toBe("deepseek-v4-flash");
});

test("withCanonicalIdsForDeepSeek > supports extra mapping override", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek, {
    "deepseek/custom-model": "custom-native-id",
  });

  const model = provider.languageModel("deepseek/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
