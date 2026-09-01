import { expect, test } from "bun:test";

import { createAzure } from "@ai-sdk/azure";

import { withCanonicalIdsForAzure } from "./canonical";

const azure = createAzure({ apiKey: "test-key", resourceName: "test-resource" });

test("withCanonicalIdsForAzure > strips canonical namespace", () => {
  const provider = withCanonicalIdsForAzure(azure);

  const model = provider.languageModel("openai/gpt-5.6-luna");
  expect(model.modelId).toBe("gpt-5.6-luna");
});

test("withCanonicalIdsForAzure > supports custom deployment names", () => {
  const provider = withCanonicalIdsForAzure(azure, {
    "openai/gpt-5.6-luna": "production-luna",
  });

  const model = provider.languageModel("openai/gpt-5.6-luna");
  expect(model.modelId).toBe("production-luna");
});
