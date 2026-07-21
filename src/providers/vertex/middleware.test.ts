import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { vertexGemmaThinkingMiddleware, vertexServiceTierMiddleware } from "./middleware";

const vertexServiceTierCases = [
  {
    tier: "auto",
    expectedHeaders: {},
  },
  {
    tier: "default",
    expectedHeaders: {
      "x-vertex-ai-llm-request-type": "shared",
    },
  },
  {
    tier: "flex",
    expectedHeaders: {
      "x-vertex-ai-llm-request-type": "shared",
      "x-vertex-ai-llm-shared-request-type": "flex",
    },
  },
  {
    tier: "priority",
    expectedHeaders: {
      "x-vertex-ai-llm-request-type": "shared",
      "x-vertex-ai-llm-shared-request-type": "priority",
    },
  },
  {
    tier: "scale",
    expectedHeaders: {
      "x-vertex-ai-llm-request-type": "dedicated",
    },
  },
] as const;

for (const { tier, expectedHeaders } of vertexServiceTierCases) {
  test(`vertexServiceTierMiddleware > should map ${tier} tier to expected headers`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        vertex: {
          serviceTier: tier,
        },
      },
    };

    const result = await vertexServiceTierMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-pro" }),
    });

    expect(result.headers).toEqual(expectedHeaders);
    expect(result.providerOptions!["vertex"]).toEqual({});
  });
}

test("vertexServiceTierMiddleware > should not override pre-set headers", async () => {
  const params = {
    prompt: [],
    headers: {
      "x-vertex-ai-llm-request-type": "shared",
      "x-vertex-ai-llm-shared-request-type": "priority",
    },
    providerOptions: {
      vertex: {
        serviceTier: "flex",
      },
    },
  };

  const result = await vertexServiceTierMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result.headers).toEqual({
    "x-vertex-ai-llm-request-type": "shared",
    "x-vertex-ai-llm-shared-request-type": "priority",
  });
  expect(result.providerOptions!["vertex"]).toEqual({});
});

const vertexGemmaThinkingCases = [
  {
    name: "enabled reasoning maps to enable_thinking: true",
    vertex: { reasoning: { enabled: true, effort: "medium" }, reasoningEffort: "medium" },
    expected: { chat_template_kwargs: { enable_thinking: true } },
  },
  {
    name: "disabled reasoning maps to enable_thinking: false",
    vertex: { reasoning: { enabled: false, effort: "none" }, reasoningEffort: "none" },
    expected: { chat_template_kwargs: { enable_thinking: false } },
  },
  {
    name: "no reasoning leaves params untouched",
    vertex: { temperature: 0.5 },
    expected: { temperature: 0.5 },
  },
] as const;

for (const { name, vertex, expected } of vertexGemmaThinkingCases) {
  test(`vertexGemmaThinkingMiddleware > ${name}`, async () => {
    const result = await vertexGemmaThinkingMiddleware.transformParams!({
      type: "generate",
      params: { prompt: [], providerOptions: { vertex: structuredClone(vertex) } },
      model: new MockLanguageModelV3({ modelId: "google/gemma-4-26b-a4b-it-maas" }),
    });

    expect(result.providerOptions!["vertex"]).toEqual(expected);
  });
}

test("vertexGemmaThinkingMiddleware > should not touch non-gemma models", async () => {
  const vertex = { reasoning: { enabled: true, effort: "medium" }, reasoningEffort: "medium" };

  const result = await vertexGemmaThinkingMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { vertex: structuredClone(vertex) } },
    model: new MockLanguageModelV3({ modelId: "openai/gpt-oss-120b-maas" }),
  });

  expect(result.providerOptions!["vertex"]).toEqual(vertex);
});
