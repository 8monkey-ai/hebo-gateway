import { expect, test } from "bun:test";

import { moonshotai } from "@ai-sdk/moonshotai";

import { withCanonicalIdsForMoonshot } from "./canonical";

test("withCanonicalIdsForMoonshot > strips namespace for kimi-k2.5", () => {
  const provider = withCanonicalIdsForMoonshot(moonshotai);

  const model = provider.languageModel("moonshot/kimi-k2.5");
  expect(model.modelId).toBe("kimi-k2.5");
});

test("withCanonicalIdsForMoonshot > strips namespace for kimi-k2.6", () => {
  const provider = withCanonicalIdsForMoonshot(moonshotai);

  const model = provider.languageModel("moonshot/kimi-k2.6");
  expect(model.modelId).toBe("kimi-k2.6");
});

test("withCanonicalIdsForMoonshot > supports extra mapping override", () => {
  const provider = withCanonicalIdsForMoonshot(moonshotai, {
    "moonshot/custom-model": "custom-native-id",
  });

  const model = provider.languageModel("moonshot/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
