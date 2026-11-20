import { expect, test } from "bun:test";

import { createFireworks } from "@ai-sdk/fireworks";

import { fromModelsDev, type ModelsDevApi } from "../../models/models-dev.ts";
import { withCanonicalIdsForFireworks } from "./canonical.ts";

test("withCanonicalIdsForFireworks > supports extra mapping override", () => {
  const custom = withCanonicalIdsForFireworks(createFireworks({ apiKey: "test-key" }), {
    "meta/custom-model": "accounts/fireworks/models/custom",
  });

  const model = custom.languageModel("meta/custom-model");
  expect(model.modelId).toBe("accounts/fireworks/models/custom");
});

test("fireworks-ai > prefers model listings over routers", () => {
  const listing = (canonicalId: string) => ({
    canonical_model_id: canonicalId,
    reasoning: true,
    modalities: { input: ["text"], output: ["text"] },
  });
  const api: ModelsDevApi = {
    "fireworks-ai": {
      models: {
        "accounts/fireworks/routers/minimax-m9": listing("minimax/MiniMax-M9"),
        "accounts/fireworks/models/minimax-m9-fast": listing("minimax/MiniMax-M9"),
        "accounts/fireworks/routers/minimax-latest": listing("minimax/MiniMax-M10"),
      },
    },
  };

  const catalog = fromModelsDev(api, [{ namespace: "minimax", provider: "minimax" }]);
  expect(catalog["minimax/MiniMax-M9"]?.providers).toEqual({
    fireworks: { id: "accounts/fireworks/models/minimax-m9-fast" },
  });
  // Only listed as a router: served from it.
  expect(catalog["minimax/MiniMax-M10"]?.providers).toEqual({
    fireworks: { id: "accounts/fireworks/routers/minimax-latest" },
  });
});
