import { expect, test } from "bun:test";

import { createAzure } from "@ai-sdk/azure";

import { withCanonicalIdsForAzure } from "./canonical";

const provider = withCanonicalIdsForAzure(
  createAzure({ resourceName: "test-resource", apiKey: "test-key" }),
);

// Azure deployment names for the GPT-5.x family match the canonical ID with the
// namespace stripped, so the default transform is enough.
const defaultTransforms: [canonical: string, deployment: string][] = [
  ["openai/gpt-5.5", "gpt-5.5"],
  ["openai/gpt-5.6-sol", "gpt-5.6-sol"],
  ["openai/gpt-5.6-terra", "gpt-5.6-terra"],
  ["openai/gpt-5.6-luna", "gpt-5.6-luna"],
  ["openai/gpt-5.4", "gpt-5.4"],
];

for (const [canonical, deployment] of defaultTransforms) {
  test(`default transform: ${canonical} → ${deployment}`, () => {
    expect(provider.languageModel(canonical).modelId).toBe(deployment);
  });
}

const explicitMappings: [canonical: string, deployment: string][] = [
  ["anthropic/claude-sonnet-4.6", "claude-sonnet-4-6"],
  ["anthropic/claude-opus-4.8", "claude-opus-4-8"],
  ["cohere/command-a", "cohere-command-a"],
  ["meta/llama-3.3-70b", "llama-3.3-70b-instruct"],
];

for (const [canonical, deployment] of explicitMappings) {
  test(`explicit mapping: ${canonical} → ${deployment}`, () => {
    expect(provider.languageModel(canonical).modelId).toBe(deployment);
  });
}

test("withCanonicalIdsForAzure > maps embedding models", () => {
  expect(provider.embeddingModel("openai/text-embedding-3-small").modelId).toBe(
    "text-embedding-3-small",
  );
  expect(provider.embeddingModel("cohere/embed-v4.0").modelId).toBe("cohere-embed-v-4-0");
});

test("withCanonicalIdsForAzure > supports extra mapping override", () => {
  const custom = withCanonicalIdsForAzure(
    createAzure({ resourceName: "test-resource", apiKey: "test-key" }),
    { "openai/gpt-5.6-sol": "my-sol-deployment" },
  );

  expect(custom.languageModel("openai/gpt-5.6-sol").modelId).toBe("my-sol-deployment");
});
