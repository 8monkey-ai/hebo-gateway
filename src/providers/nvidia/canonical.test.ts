import { expect, test } from "bun:test";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { withCanonicalIdsForNvidia } from "./canonical";

const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

test("withCanonicalIdsForNvidia > maps meta/llama-4-maverick to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("meta/llama-4-maverick");
  expect(model.modelId).toBe("meta/llama-4-maverick-17b-128e-instruct");
});

test("withCanonicalIdsForNvidia > maps google/gemma-3-27b to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("google/gemma-3-27b");
  expect(model.modelId).toBe("google/gemma-3-27b-it");
});

test("withCanonicalIdsForNvidia > maps google/gemma-4-e2b to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("google/gemma-4-e2b");
  expect(model.modelId).toBe("google/gemma-3n-e2b-it");
});

test("withCanonicalIdsForNvidia > maps google/gemma-4-e4b to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("google/gemma-4-e4b");
  expect(model.modelId).toBe("google/gemma-3n-e4b-it");
});

test("withCanonicalIdsForNvidia > maps deepseek/deepseek-v3.2 to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("deepseek/deepseek-v3.2");
  expect(model.modelId).toBe("deepseek-ai/deepseek-v3.2");
});

test("withCanonicalIdsForNvidia > maps minimax/m2.7 to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("minimax/m2.7");
  expect(model.modelId).toBe("minimaxai/minimax-m2.7");
});

test("withCanonicalIdsForNvidia > maps nvidia/mistral-nemotron to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/mistral-nemotron");
  expect(model.modelId).toBe("mistralai/mistral-nemotron");
});

test("withCanonicalIdsForNvidia > maps nvidia/mistral-large-3-675b to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/mistral-large-3-675b");
  expect(model.modelId).toBe("mistralai/mistral-large-3-675b-instruct-2512");
});

test("withCanonicalIdsForNvidia > maps nvidia/devstral-2-123b to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/devstral-2-123b");
  expect(model.modelId).toBe("mistralai/devstral-2-123b-instruct-2512");
});

test("withCanonicalIdsForNvidia > maps nvidia/qwen3-coder-480b to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/qwen3-coder-480b");
  expect(model.modelId).toBe("qwen/qwen3-coder-480b-a35b-instruct");
});

test("withCanonicalIdsForNvidia > maps nvidia/deepseek-v3.1-terminus to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/deepseek-v3.1-terminus");
  expect(model.modelId).toBe("deepseek-ai/deepseek-v3.1-terminus");
});

test("withCanonicalIdsForNvidia > maps nvidia/kimi-k2 to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/kimi-k2");
  expect(model.modelId).toBe("moonshotai/kimi-k2-instruct");
});

test("withCanonicalIdsForNvidia > maps nvidia/glm-4.7 to NIM model ID", () => {
  const provider = withCanonicalIdsForNvidia(nvidia);
  const model = provider.languageModel("nvidia/glm-4.7");
  expect(model.modelId).toBe("z-ai/glm-4.7");
});

test("withCanonicalIdsForNvidia > supports extra mapping override", () => {
  const provider = withCanonicalIdsForNvidia(nvidia, {
    "nvidia/custom-model": "custom-native-id",
  });
  const model = provider.languageModel("nvidia/custom-model");
  expect(model.modelId).toBe("custom-native-id");
});
