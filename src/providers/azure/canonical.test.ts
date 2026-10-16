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

test("withCanonicalIdsForAzure > maps transcription models", () => {
  const provider = withCanonicalIdsForAzure(azure, {
    "openai/gpt-transcribe": "production-transcribe",
  });

  expect(provider.transcriptionModel!("openai/gpt-transcribe").modelId).toBe(
    "production-transcribe",
  );
  // MAI-Transcribe IDs must stay MAI model names: the Azure SDK routes them to the Speech API.
  expect(provider.transcriptionModel!("microsoft/mai-transcribe-2").modelId).toBe(
    "mai-transcribe-2",
  );
});
