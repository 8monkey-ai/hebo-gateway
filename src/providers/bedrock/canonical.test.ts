import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

import { withCanonicalIdsForBedrock } from "./canonical";

test("withCanonicalIdsForBedrock > maps Claude Opus 5 to inference profile without version postfix", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("anthropic/claude-opus-5");
  expect(model.modelId).toBe("us.anthropic.claude-opus-5");
});

test("withCanonicalIdsForBedrock > maps Claude Sonnet 5 to inference profile without version postfix", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("anthropic/claude-sonnet-5");
  expect(model.modelId).toBe("us.anthropic.claude-sonnet-5");
});

// GPT-5.x is on-demand only: no `us.` inference-profile prefix and no `-v1:0` postfix,
// and the dotted version is preserved rather than normalized to a hyphen.
const gptMappings: [canonical: string, nativeId: string][] = [
  ["openai/gpt-5.5", "openai.gpt-5.5"],
  ["openai/gpt-5.6-sol", "openai.gpt-5.6-sol"],
  ["openai/gpt-5.6-terra", "openai.gpt-5.6-terra"],
  ["openai/gpt-5.6-luna", "openai.gpt-5.6-luna"],
];

for (const [canonical, nativeId] of gptMappings) {
  test(`withCanonicalIdsForBedrock > maps ${canonical} to ${nativeId}`, () => {
    const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
    expect(provider.languageModel(canonical).modelId).toBe(nativeId);
  });

  test(`withCanonicalIdsForBedrock > keeps ${canonical} on-demand when avoiding inference profiles`, () => {
    const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }), {
      inferenceProfile: { mode: "avoid" },
    });
    expect(provider.languageModel(canonical).modelId).toBe(nativeId);
  });
}
