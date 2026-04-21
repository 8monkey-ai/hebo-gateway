import { expect, test } from "bun:test";

import { createZhipu } from "zhipu-ai-provider";

import { withCanonicalIdsForZhipu } from "./canonical";

const provider = withCanonicalIdsForZhipu(createZhipu({ apiKey: "test-key" }));

const explicitMappings: [canonical: string, nativeId: string][] = [
  ["zhipu/glm-5", "glm-5-20260211"],
  ["zhipu/glm-5-turbo", "glm-5-turbo-20260315"],
  ["zhipu/glm-5.1", "glm-5.1-20260406"],
];

for (const [canonical, nativeId] of explicitMappings) {
  test(`explicit mapping: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}

test("withCanonicalIdsForZhipu > supports extra mapping override", () => {
  const customProvider = withCanonicalIdsForZhipu(createZhipu({ apiKey: "test-key" }), {
    "zhipu/custom-model": "custom-native-id",
  });

  const model = customProvider.languageModel("zhipu/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
