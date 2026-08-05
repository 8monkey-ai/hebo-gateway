import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { createVoyage } from "voyage-ai-provider";

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

test.each([
  ["azure", "gpt-5.6-sol"],
  ["bedrock", "openai.gpt-5.6-sol"],
] as const)("resolves GPT-5.6 Sol through %s", (providerId, nativeId) => {
  const providers = {
    azure: withCanonicalIdsForAzure(
      createAzure({ resourceName: "test-resource", apiKey: "test-key" }),
    ),
    bedrock: withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" })),
  };
  const models = gpt56Sol({ providers: [providerId] });
  const modelId = "openai/gpt-5.6-sol";

  const provider = resolveProvider({ providers, models, modelId, operation: "chat" });

  expect(provider.languageModel(modelId).modelId).toBe(nativeId);
});
