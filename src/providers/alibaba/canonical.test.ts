import { expect, test } from "bun:test";

import { createAlibaba } from "@ai-sdk/alibaba";

import { withCanonicalIdsForAlibaba } from "./canonical.ts";

const provider = withCanonicalIdsForAlibaba(createAlibaba({ apiKey: "test-key" }));

const stripNamespaceFallbacks: [canonical: string, nativeId: string][] = [
  ["alibaba/qwen3.5-397b-a17b", "qwen3.5-397b-a17b"],
  ["alibaba/qwen3.5-122b-a10b", "qwen3.5-122b-a10b"],
  ["alibaba/qwen3.5-35b-a3b", "qwen3.5-35b-a3b"],
  ["alibaba/qwen3.8-2.4t-a95b", "qwen3.8-2.4t-a95b"],
  ["alibaba/qwen3.5-plus", "qwen3.5-plus"],
  ["alibaba/qwen3.5-flash", "qwen3.5-flash"],
  ["alibaba/qwen3.5-27b", "qwen3.5-27b"],
  ["alibaba/qwen3.5-9b", "qwen3.5-9b"],
  ["alibaba/qwen3.6-plus", "qwen3.6-plus"],
  ["alibaba/qwen3.6-27b", "qwen3.6-27b"],
  ["alibaba/qwen3.7-plus", "qwen3.7-plus"],
  ["alibaba/qwen3.7-max", "qwen3.7-max"],
  ["alibaba/qwen3.8-max", "qwen3.8-max"],
  ["alibaba/qwen3.8-flash", "qwen3.8-flash"],
  ["alibaba/qwen3.8-omni-flash", "qwen3.8-omni-flash"],
  ["alibaba/qwen3.8-27b", "qwen3.8-27b"],
];

for (const [canonical, nativeId] of stripNamespaceFallbacks) {
  test(`stripNamespace fallback: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}
