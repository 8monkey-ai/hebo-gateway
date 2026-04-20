import { expect, test } from "bun:test";

import { xai } from "@ai-sdk/xai";

import { withCanonicalIdsForXai } from "./canonical";

test("withCanonicalIdsForXai > maps canonical IDs to xAI native model IDs", () => {
  const provider = withCanonicalIdsForXai(xai);

  const model = provider.languageModel("xai/grok-4.1-fast");
  expect(model.modelId).toBe("grok-4-1-fast-non-reasoning");
});

test("withCanonicalIdsForXai > maps reasoning model IDs", () => {
  const provider = withCanonicalIdsForXai(xai);

  const model = provider.languageModel("xai/grok-4.2-reasoning");
  expect(model.modelId).toBe("grok-4.20-0309-reasoning");
});

test("withCanonicalIdsForXai > supports extra mapping override", () => {
  const provider = withCanonicalIdsForXai(xai, {
    "xai/custom-model": "custom-native-id",
  });

  const model = provider.languageModel("xai/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
