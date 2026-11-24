import { expect, test } from "bun:test";

import { createZhipu } from "zhipu-ai-provider";

import { withCanonicalIdsForZai } from "./canonical.ts";

const provider = withCanonicalIdsForZai(createZhipu({ apiKey: "test-key" }));

const defaultMappings: [canonical: string, nativeId: string][] = [
  ["zhipuai/glm-5.3", "glm-5.3"],
  ["zhipuai/glm-5.3-flash", "glm-5.3-flash"],
];

for (const [canonical, nativeId] of defaultMappings) {
  test(`default transform: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}

test("withCanonicalIdsForZai > supports extra mapping override", () => {
  const customProvider = withCanonicalIdsForZai(createZhipu({ apiKey: "test-key" }), {
    "zhipu/custom-model": "custom-native-id",
  });

  const model = customProvider.languageModel("zhipu/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
