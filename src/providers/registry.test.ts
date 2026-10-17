import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { createVoyage } from "voyage-ai-provider";

import { claudeHaiku45 } from "../models/anthropic/presets";
import { maiTranscribe2 } from "../models/microsoft/presets";
import { gpt56Sol } from "../models/openai/presets";
import { voyage4Lite } from "../models/voyage/presets";
import { withCanonicalIdsForAzure } from "../providers/azure/canonical";
import { withCanonicalIdsForBedrock } from "../providers/bedrock/canonical";
import { withCanonicalIdsForVoyage } from "../providers/voyage/canonical";
import { resolveProvider } from "./registry";

test("Voyage 4 Lite ID transformation in gateway config", () => {
  const config = {
    providers: {
      voyage: withCanonicalIdsForVoyage(
        createVoyage({
          apiKey: "test-key",
        }),
      ),
    },
    models: {
      ...voyage4Lite({
        providers: ["voyage"],
      }),
    },
  };

  const modelId = "voyage/voyage-4-lite";

  // 1. Resolve the provider for embeddings
  const provider = resolveProvider({
    providers: config.providers,
    models: config.models,
    modelId,
    operation: "embeddings",
  });

  // 2. Get the actual embedding model instance
  const embeddingModel = provider.embeddingModel(modelId);

  // 3. Verify the internal modelId is stripped of the 'voyage/' prefix
  expect(embeddingModel.modelId).toBe("voyage-4-lite");

  // 4. Check the providers registry directly
  const registry = config.providers;
  const directModel = registry["voyage"].embeddingModel(modelId);
  expect(directModel.modelId).toBe("voyage-4-lite");
});

test("GPT-5.6 Sol resolves through Bedrock's Mantle endpoint in gateway config", () => {
  const config = {
    providers: {
      bedrock: withCanonicalIdsForBedrock(
        createAmazonBedrock({ region: "us-east-1", apiKey: "test-key" }),
      ),
    },
    models: {
      ...gpt56Sol({
        providers: ["bedrock"],
      }),
    },
  };

  const modelId = "openai/gpt-5.6-sol";

  const provider = resolveProvider({
    providers: config.providers,
    models: config.models,
    modelId,
    operation: "chat",
  });

  const languageModel = provider.languageModel(modelId);

  expect(languageModel.modelId).toBe("openai.gpt-5.6-sol");
  expect(languageModel.provider).toBe("bedrock-mantle.responses");
});

test("Claude Haiku 4.5 resolves through Bedrock's InvokeModel endpoint", () => {
  const config = {
    providers: {
      bedrock: withCanonicalIdsForBedrock(
        createAmazonBedrock({ region: "us-east-1", apiKey: "test-key" }),
      ),
    },
    models: {
      ...claudeHaiku45({
        providers: ["bedrock"],
      }),
    },
  };

  const modelId = "anthropic/claude-haiku-4.5";

  const provider = resolveProvider({
    providers: config.providers,
    models: config.models,
    modelId,
    operation: "chat",
  });

  const languageModel = provider.languageModel(modelId);

  // Same Bedrock ID as on Converse, but served with the Anthropic request shape.
  expect(languageModel.modelId).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
  expect(languageModel.provider).toBe("bedrock.anthropic.messages");
});

test("MAI-Transcribe 2 resolves through Azure for transcriptions", () => {
  const config = {
    providers: {
      azure: withCanonicalIdsForAzure(createAzure({ resourceName: "test", apiKey: "test-key" })),
    },
    models: {
      ...maiTranscribe2(),
    },
  };

  const modelId = "microsoft/mai-transcribe-2";

  const provider = resolveProvider({
    providers: config.providers,
    models: config.models,
    modelId,
    operation: "transcriptions",
  });

  const transcriptionModel = provider.transcriptionModel!(modelId);
  expect(transcriptionModel.modelId).toBe("mai-transcribe-2");
  expect(transcriptionModel.provider).toBe("azure.transcription");
});

test("transcriptions reject models without audio input", () => {
  expect(() =>
    resolveProvider({
      providers: {},
      models: { ...gpt56Sol() },
      modelId: "openai/gpt-5.6-sol",
      operation: "transcriptions",
    }),
  ).toThrow("Model 'openai/gpt-5.6-sol' does not support 'audio' input");
});
