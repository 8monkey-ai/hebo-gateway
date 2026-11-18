import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { MockProviderV4 } from "ai/test";
import { createVoyage } from "voyage-ai-provider";

import { createModelCatalog, defineModelCatalog } from "../models/catalog.ts";
// oxlint-disable no-unassigned-import
import "../models/anthropic/index.ts";
import "../models/microsoft/index.ts";
import "../models/openai/index.ts";
import "../models/voyage/index.ts";
// oxlint-enable no-unassigned-import
import { withCanonicalIdsForAzure } from "../providers/azure/canonical.ts";
import { withCanonicalIdsForBedrock } from "../providers/bedrock/canonical.ts";
import { withCanonicalIdsForVoyage } from "../providers/voyage/canonical.ts";
import { getNativeIds, resolveProvider } from "./registry.ts";
import type { ProviderRegistry } from "./types.ts";

/** The gateway catalog for `id`, from the bundled snapshot: it hands out the native IDs. */
const catalog = (providers: ProviderRegistry, id: string) =>
  createModelCatalog(defineModelCatalog(id), providers, { source: false }).current!;

test("Voyage 4 Lite ID transformation in gateway config", () => {
  const config = {
    providers: {
      voyage: withCanonicalIdsForVoyage(
        createVoyage({
          apiKey: "test-key",
        }),
      ),
    },
  };
  const models = catalog(config.providers, "voyageai/voyage-4-lite");

  const modelId = "voyageai/voyage-4-lite";

  // 1. Resolve the provider for embeddings
  const provider = resolveProvider({
    providers: config.providers,
    models,
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
  };
  const models = catalog(config.providers, "openai/gpt-5.6-sol");

  const modelId = "openai/gpt-5.6-sol";

  const provider = resolveProvider({
    providers: config.providers,
    models,
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
  };
  const models = catalog(config.providers, "anthropic/claude-haiku-4-5-20251001");

  const modelId = "anthropic/claude-haiku-4-5-20251001";

  const provider = resolveProvider({
    providers: config.providers,
    models,
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
  };
  // Not on models.dev yet: added by the lab module.
  const models = catalog(config.providers, "microsoft/mai-transcribe-2");

  const modelId = "microsoft/mai-transcribe-2";

  const provider = resolveProvider({
    providers: config.providers,
    models,
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
      models: catalog({ openai: new MockProviderV4() }, "openai/gpt-5.6-sol"),
      modelId: "openai/gpt-5.6-sol",
      operation: "transcriptions",
    }),
  ).toThrow("Model 'openai/gpt-5.6-sol' does not support 'transcription' output");
});

test("catalog native IDs win over the fallback transform, explicit mappings over both", () => {
  const voyage = withCanonicalIdsForVoyage(createVoyage({ apiKey: "test-key" }), {
    "voyageai/voyage-pinned": "voyage-pinned-2",
  });
  getNativeIds(voyage)!.set("voyageai/voyage-9", "voyage-9-native");
  getNativeIds(voyage)!.set("voyageai/voyage-pinned", "ignored");

  expect(voyage.embeddingModel("voyageai/voyage-9").modelId).toBe("voyage-9-native");
  expect(voyage.embeddingModel("voyageai/voyage-pinned").modelId).toBe("voyage-pinned-2");
  expect(voyage.embeddingModel("voyageai/voyage-unknown").modelId).toBe("voyage-unknown");
});
