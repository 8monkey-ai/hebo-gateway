import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { vertexMetadataMiddleware, vertexServiceTierMiddleware } from "./middleware";

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

test("vertexMetadataMiddleware > translates metadata into labels", async () => {
  const result = await vertexMetadataMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { vertex: { metadata: { team: "core" } } } },
    model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-pro" }),
  });

  expect(result.providerOptions!["vertex"]).toEqual({ labels: { team: "core" } });
});

test("vertexMetadataMiddleware > merges metadata over existing labels", async () => {
  const result = await vertexMetadataMiddleware.transformParams!({
    type: "generate",
    params: {
      prompt: [],
      providerOptions: { vertex: { metadata: { team: "core" }, labels: { env: "prod" } } },
    },
    model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-pro" }),
  });

  expect(result.providerOptions!["vertex"]).toEqual({
    labels: { env: "prod", team: "core" },
  });
});

test("vertexMetadataMiddleware > leaves params untouched without metadata", async () => {
  const result = await vertexMetadataMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { vertex: { labels: { env: "prod" } } } },
    model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-pro" }),
  });

  expect(result.providerOptions!["vertex"]).toEqual({ labels: { env: "prod" } });
});
