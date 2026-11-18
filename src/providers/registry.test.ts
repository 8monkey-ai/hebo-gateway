import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { createVoyage } from "voyage-ai-provider";

import { BUNDLED_MODEL_CATALOG } from "../models/catalog.ts";
import type { CatalogModel, ModelCatalog } from "../models/types.ts";
import { withCanonicalIdsForAzure } from "../providers/azure/canonical.ts";
import { withCanonicalIdsForBedrock } from "../providers/bedrock/canonical.ts";
import { withCanonicalIdsForVoyage } from "../providers/voyage/canonical.ts";
import { getCanonicalIdsResolver, resolveProvider } from "./registry.ts";

/** A bundled catalog entry, served by the given providers. */
const bundled = (id: string, providers: CatalogModel["providers"]): ModelCatalog => ({
  [id]: { ...BUNDLED_MODEL_CATALOG[id]!, providers },
});

test("Voyage 4 Lite ID transformation in gateway config", () => {
  const config = {
    providers: {
      voyage: withCanonicalIdsForVoyage(
        createVoyage({
          apiKey: "test-key",
        }),
      ),
    },
    models: bundled("voyageai/voyage-4-lite", ["voyage"]),
  };

  const modelId = "voyageai/voyage-4-lite";

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
    models: bundled("openai/gpt-5.6-sol", ["bedrock"]),
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
    models: bundled("anthropic/claude-haiku-4-5-20251001", ["bedrock"]),
  };

  const modelId = "anthropic/claude-haiku-4-5-20251001";

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
      "microsoft/mai-transcribe-2": {
        modalities: { input: ["audio"], output: ["transcription"] },
        providers: ["azure"],
      },
    } satisfies ModelCatalog,
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

test("transcriptions reject models without transcription output", () => {
  expect(() =>
    resolveProvider({
      providers: {},
      models: bundled("openai/gpt-5.6-sol", ["openai"]),
      modelId: "openai/gpt-5.6-sol",
      operation: "transcriptions",
    }),
  ).toThrow("Model 'openai/gpt-5.6-sol' does not support 'transcription' output");
});

test("canonical adapters only claim the models whose native IDs they know", () => {
  const bedrock = getCanonicalIdsResolver(
    withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1", apiKey: "test-key" })),
  )!;
  // Default transform (Nova), explicit mapping, and Mantle.
  expect(bedrock("amazon/nova-pro", "text")).toBe(true);
  expect(bedrock("anthropic/claude-sonnet-4-6", "text")).toBe(true);
  expect(bedrock("openai/gpt-5.6-sol", "text")).toBe(true);
  expect(bedrock("anthropic/claude-unmapped-9", "text")).toBe(false);

  const voyage = getCanonicalIdsResolver(
    withCanonicalIdsForVoyage(createVoyage({ apiKey: "test-key" })),
  )!;
  expect(voyage("voyageai/voyage-9", "embeddings")).toBe(true);
  expect(voyage("openai/text-embedding-3-small", "embeddings")).toBe(false);
  // Voyage serves no transcription models.
  expect(voyage("voyageai/voyage-9", "transcription")).toBe(false);
});
