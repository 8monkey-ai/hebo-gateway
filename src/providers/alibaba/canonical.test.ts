import { expect, test } from "bun:test";

import { createAlibaba } from "@ai-sdk/alibaba";

import { withCanonicalIdsForAlibaba } from "./canonical";

const provider = withCanonicalIdsForAlibaba(
  createAlibaba({ apiKey: "test-key" }),
);

const explicitMappings: [canonical: string, nativeId: string][] = [
  ["alibaba/qwen3-235b", "qwen3-235b-a22b"],
  ["alibaba/qwen3.5-397b", "qwen3.5-397b-a17b"],
  ["alibaba/qwen3.5-122b", "qwen3.5-122b-a10b"],
  ["alibaba/qwen3.5-35b", "qwen3.5-35b-a3b"],
  ["alibaba/qwen3.5-0.8b", "qwen3.5-0.8b"],
  ["alibaba/qwen3.6-flash", "qwen3.6-35b-a3b"],
  ["alibaba/qwen3-vl-235b", "qwen3-vl-235b-a22b"],
];

for (const [canonical, nativeId] of explicitMappings) {
  test(`explicit mapping: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}

const stripNamespaceFallbacks: [canonical: string, nativeId: string][] = [
  ["alibaba/qwen3-32b", "qwen3-32b"],
  ["alibaba/qwen3.5-plus", "qwen3.5-plus"],
  ["alibaba/qwen3.5-flash", "qwen3.5-flash"],
  ["alibaba/qwen3.5-27b", "qwen3.5-27b"],
  ["alibaba/qwen3.5-9b", "qwen3.5-9b"],
  ["alibaba/qwen3.5-4b", "qwen3.5-4b"],
  ["alibaba/qwen3.5-2b", "qwen3.5-2b"],
  ["alibaba/qwen3.6-plus", "qwen3.6-plus"],
  ["alibaba/qwen3.6-27b", "qwen3.6-27b"],
  ["alibaba/qwen3.6-max-preview", "qwen3.6-max-preview"],
  ["alibaba/qwen3-coder-next", "qwen3-coder-next"],
  ["alibaba/qwen3-embedding-0.6b", "qwen3-embedding-0.6b"],
  ["alibaba/qwen3-embedding-4b", "qwen3-embedding-4b"],
  ["alibaba/qwen3-embedding-8b", "qwen3-embedding-8b"],
];

for (const [canonical, nativeId] of stripNamespaceFallbacks) {
  test(`stripNamespace fallback: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}
