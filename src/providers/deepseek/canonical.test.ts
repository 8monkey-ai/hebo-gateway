import { expect, test } from "bun:test";

import { deepseek } from "@ai-sdk/deepseek";

import { loadBundledCatalog } from "../../../test/helpers/catalog.ts";
import { withCanonicalIdsForDeepSeek } from "./canonical.ts";

test("withCanonicalIdsForDeepSeek > serves dated releases from their catalog alias", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek);
  loadBundledCatalog("deepseek", provider);

  const model = provider.languageModel("deepseek/deepseek-v4-pro-0813");
  expect(model.modelId).toBe("deepseek-v4-pro");
  expect(provider.languageModel("deepseek/deepseek-v4.1-flash-1017").modelId).toBe(
    "deepseek-flash",
  );
});

test("withCanonicalIdsForDeepSeek > supports extra mapping override", () => {
  const provider = withCanonicalIdsForDeepSeek(deepseek, {
    "deepseek/custom-model": "custom-native-id",
  });

  const model = provider.languageModel("deepseek/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
