import { expect, test } from "bun:test";

import { createAlibaba } from "@ai-sdk/alibaba";

import { withCanonicalIdsForAlibaba } from "./canonical";

const provider = withCanonicalIdsForAlibaba(
  createAlibaba({ apiKey: "test-key" }),
);

const explicitMappings: [canonical: string, nativeId: string][] = [
  ["alibaba/qwen3-235b", "qwen3-235b-a22b"],
  ["alibaba/qwen3-30b", "qwen3-30b-a3b"],
  ["alibaba/qwen3-235b-a22b-thinking", "qwen3-235b-a22b-thinking-2507"],
  ["alibaba/qwen3.5-397b", "qwen3.5-397b-a17b"],
  ["alibaba/qwen3-coder", "qwen-coder"],
  ["alibaba/qwen3-coder-480b", "qwen3-coder-480b-a35b-instruct"],
  ["alibaba/qwen3-coder-30b", "qwen3-coder-30b-a3b-instruct"],
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
  ["alibaba/qwen3-14b", "qwen3-14b"],
  ["alibaba/qwen3-8b", "qwen3-8b"],
  ["alibaba/qwen3-max", "qwen3-max"],
  ["alibaba/qwen3-max-thinking", "qwen3-max-thinking"],
  ["alibaba/qwen3-max-preview", "qwen3-max-preview"],
  ["alibaba/qwen3-next-80b-a3b-thinking", "qwen3-next-80b-a3b-thinking"],
  ["alibaba/qwen3-next-80b-a3b-instruct", "qwen3-next-80b-a3b-instruct"],
  ["alibaba/qwen3.5-plus", "qwen3.5-plus"],
  ["alibaba/qwen3.5-flash", "qwen3.5-flash"],
  ["alibaba/qwen3.6-plus", "qwen3.6-plus"],
  ["alibaba/qwen3.6-plus-preview", "qwen3.6-plus-preview"],
  ["alibaba/qwen3.6-flash", "qwen3.6-flash"],
  ["alibaba/qwen3-coder-plus", "qwen3-coder-plus"],
  ["alibaba/qwen3-coder-flash", "qwen3-coder-flash"],
  ["alibaba/qwen3-coder-next", "qwen3-coder-next"],
  ["alibaba/qwen3-vl-plus", "qwen3-vl-plus"],
  ["alibaba/qwen3-vl-thinking", "qwen3-vl-thinking"],
  ["alibaba/qwen3-vl-instruct", "qwen3-vl-instruct"],
];

for (const [canonical, nativeId] of stripNamespaceFallbacks) {
  test(`stripNamespace fallback: ${canonical} → ${nativeId}`, () => {
    const model = provider.languageModel(canonical);
    expect(model.modelId).toBe(nativeId);
  });
}
