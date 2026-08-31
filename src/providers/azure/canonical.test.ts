import { expect, test } from "bun:test";

import { createAzure } from "@ai-sdk/azure";

import { withCanonicalIdsForAzure } from "./canonical";

const azure = () => createAzure({ resourceName: "test-resource", apiKey: "test-key" });

test("withCanonicalIdsForAzure > resolves the deployment named after the model", () => {
  const provider = withCanonicalIdsForAzure(azure());
  const model = provider.languageModel("openai/gpt-5.6-luna");

  expect(model.modelId).toBe("gpt-5.6-luna");
});

test("withCanonicalIdsForAzure > keeps the dotted version of a canonical ID", () => {
  const provider = withCanonicalIdsForAzure(azure());

  expect(provider.languageModel("openai/gpt-5.1").modelId).toBe("gpt-5.1");
  expect(provider.languageModel("anthropic/claude-sonnet-4.5").modelId).toBe("claude-sonnet-4.5");
});

test("withCanonicalIdsForAzure > resolves embedding deployments too", () => {
  const provider = withCanonicalIdsForAzure(azure());
  const model = provider.embeddingModel("openai/text-embedding-3-small");

  expect(model.modelId).toBe("text-embedding-3-small");
});

test("withCanonicalIdsForAzure > keeps the canonical ID when deployments are named after it", () => {
  const provider = withCanonicalIdsForAzure(azure(), { deployments: "canonical" });

  expect(provider.languageModel("openai/gpt-5.6-luna").modelId).toBe("openai/gpt-5.6-luna");
});

test("withCanonicalIdsForAzure > extraMapping wins over the deployment convention", () => {
  const provider = withCanonicalIdsForAzure(azure(), {
    extraMapping: { "openai/gpt-5.6-luna": "my-luna-deployment" },
  });

  expect(provider.languageModel("openai/gpt-5.6-luna").modelId).toBe("my-luna-deployment");
  // Unmapped IDs keep falling back to the deployment convention.
  expect(provider.languageModel("openai/gpt-5.1").modelId).toBe("gpt-5.1");
});
