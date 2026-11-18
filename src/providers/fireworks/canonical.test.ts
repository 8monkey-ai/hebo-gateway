import { expect, test } from "bun:test";

import { createFireworks } from "@ai-sdk/fireworks";

import { withCanonicalIdsForFireworks } from "./canonical.ts";

test("withCanonicalIdsForFireworks > supports extra mapping override", () => {
  const custom = withCanonicalIdsForFireworks(createFireworks({ apiKey: "test-key" }), {
    "meta/custom-model": "accounts/fireworks/models/custom",
  });

  const model = custom.languageModel("meta/custom-model");
  expect(model.modelId).toBe("accounts/fireworks/models/custom");
});
