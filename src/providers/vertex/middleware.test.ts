import { expect, test } from "bun:test";

import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { vertexGemma4ThinkingMiddleware, vertexServiceTierMiddleware } from "./middleware";

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
  test(`vertexGemma4ThinkingMiddleware > ${name}`, async () => {
    const result = await vertexGemma4ThinkingMiddleware.transformParams!({
      type: "generate",
      params: { prompt: [], providerOptions: { vertex: structuredClone(vertex) } },
      model: new MockLanguageModelV3({ modelId: "google/gemma-4-26b-a4b-it-maas" }),
    });

    expect(result.providerOptions!["vertex"]).toEqual(expected);
  });
}

test("vertexGemma4ThinkingMiddleware > is registered only for gemma-4", () => {
  expect(modelMiddlewareMatcher.for("google/gemma-4-26b-a4b", "vertex.maas")).toContain(
    vertexGemma4ThinkingMiddleware,
  );
  expect(modelMiddlewareMatcher.for("openai/gpt-oss-120b-maas", "vertex.maas")).not.toContain(
    vertexGemma4ThinkingMiddleware,
  );
  expect(modelMiddlewareMatcher.for("google/gemma-3-27b", "vertex.maas")).not.toContain(
    vertexGemma4ThinkingMiddleware,
  );
});

test("vertexGemma4ThinkingMiddleware > enable_thinking reaches the provider", async () => {
  const chain = modelMiddlewareMatcher.for("google/gemma-4-26b-a4b", "vertex.maas.chat");
  const model = new MockLanguageModelV3({ modelId: "google/gemma-4-26b-a4b-it-maas" });

  const params = await chain.reduce(
    async (acc, { transformParams }) => {
      const current = await acc;
      return transformParams
        ? transformParams({ type: "generate", params: current, model })
        : current;
    },
    Promise.resolve({
      prompt: [],
      providerOptions: { unknown: { reasoning: { enabled: true } } },
    } as LanguageModelV3CallOptions),
  );

  expect(params.providerOptions).toEqual({
    vertex: { chat_template_kwargs: { enable_thinking: true } },
  });
});
