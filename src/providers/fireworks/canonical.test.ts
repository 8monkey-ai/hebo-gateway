import { expect, test } from "bun:test";

import { createFireworks } from "@ai-sdk/fireworks";

import { withCanonicalIdsForFireworks } from "./canonical.ts";

const provider = withCanonicalIdsForFireworks(createFireworks({ apiKey: "test-key" }));

const explicitMappings: [canonical: string, nativeId: string][] = [
  ["meta/llama-3.3-70b-instruct", "accounts/fireworks/models/llama-v3p3-70b-instruct"],
  ["openai/gpt-oss-20b", "accounts/fireworks/models/gpt-oss-20b"],
  ["openai/gpt-oss-120b", "accounts/fireworks/models/gpt-oss-120b"],
  ["alibaba/qwen3.5-397b-a17b", "accounts/fireworks/models/qwen3p5-397b-a17b"],
  ["alibaba/qwen3.5-35b-a3b", "accounts/fireworks/models/qwen3p5-35b-a3b"],
  ["alibaba/qwen3.5-27b", "accounts/fireworks/models/qwen3p5-27b"],
  ["alibaba/qwen3.5-9b", "accounts/fireworks/models/qwen3p5-9b"],
  ["alibaba/qwen3.8-2.4t-a95b", "accounts/fireworks/models/qwen3p8-2p4t-a95b"],
  ["moonshotai/kimi-k2.5", "accounts/fireworks/models/kimi-k2p5"],
  ["moonshotai/kimi-k2.6", "accounts/fireworks/models/kimi-k2p6"],
  ["moonshotai/kimi-k3", "accounts/fireworks/models/kimi-k3"],
  ["deepseek/deepseek-v4.1-flash-1017", "accounts/fireworks/models/deepseek-v4p1-flash"],
  ["zhipuai/glm-5.3", "accounts/fireworks/models/glm-5p3"],
  ["zhipuai/glm-5.3-flash", "accounts/fireworks/models/glm-5p3-flash"],
];

for (const [canonical, nativeId] of explicitMappings) {
  test(`explicit mapping: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}

test("withCanonicalIdsForFireworks > supports extra mapping override", () => {
  const custom = withCanonicalIdsForFireworks(createFireworks({ apiKey: "test-key" }), {
    "meta/custom-model": "accounts/fireworks/models/custom",
  });

  const model = custom.languageModel("meta/custom-model");
  expect(model.modelId).toBe("accounts/fireworks/models/custom");
});
