import { expect, test } from "bun:test";

import { parseConfig } from "../config";
import { createVoyageWithCanonicalIds, voyage4Lite, createModelCatalog } from "../index";
import { resolveProvider } from "./registry";

test("Voyage 4 Lite ID transformation in gateway config", () => {
  const config = {
    providers: {
      voyage: createVoyageWithCanonicalIds({
        apiKey: "test-key",
      }),
    },
    models: createModelCatalog(
      voyage4Lite({
        providers: ["voyage"],
      }),
    ),
  };

  const parsedConfig = parseConfig(config);
  const modelId = "voyage/voyage-4-lite";

  // 1. Resolve the provider for embeddings
  const provider = resolveProvider({
    providers: parsedConfig.providers,
    models: parsedConfig.models,
    modelId,
    operation: "embeddings",
  });

  // 2. Get the actual embedding model instance
  const embeddingModel = provider.embeddingModel(modelId);

  // 3. Verify the internal modelId is stripped of the 'voyage/' prefix
  expect(embeddingModel.modelId).toBe("voyage-4-lite");

  // 4. Check the providers registry directly
  const registry = parsedConfig.providers;
  const directModel = registry.embeddingModel(`voyage:${modelId}`);
  expect(directModel.modelId).toBe("voyage-4-lite");
});
