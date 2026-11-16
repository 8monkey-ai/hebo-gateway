import { expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";
import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { fromChatCompletionsAssistantMessage } from "../../endpoints/chat-completions/converters";
import { forwardParamsMiddleware } from "../../middleware/common";
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
      model: new MockLanguageModelV4({ modelId: "google/gemini-3.1-pro-preview" }),
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
    model: new MockLanguageModelV4({ modelId: "google/gemini-3-flash-preview" }),
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
      model: new MockLanguageModelV4({
        modelId: "google/gemma-4-26b-a4b-it-maas",
        provider: "vertex.maas.chat",
      }),
    });

    expect(result.providerOptions!["vertex"]).toEqual(expected);
  });
}

const nonGemmaModelIds = ["openai/gpt-oss-120b-maas", "google/gemma-3-27b"] as const;

for (const modelId of nonGemmaModelIds) {
  test(`vertexGemma4ThinkingMiddleware > leaves ${modelId} untouched`, async () => {
    const vertex = { reasoning: { enabled: true, effort: "medium" }, reasoningEffort: "medium" };

    const result = await vertexGemma4ThinkingMiddleware.transformParams!({
      type: "generate",
      params: { prompt: [], providerOptions: { vertex: structuredClone(vertex) } },
      model: new MockLanguageModelV4({ modelId, provider: "vertex.maas.chat" }),
    });

    expect(result.providerOptions!["vertex"]).toEqual(vertex);
  });
}

test("vertexGemma4ThinkingMiddleware > is registered only for the maas endpoint", () => {
  expect(modelMiddlewareMatcher.for("google/gemma-4-26b-a4b", "vertex.maas.chat")).toContain(
    vertexGemma4ThinkingMiddleware,
  );
  expect(modelMiddlewareMatcher.for("google/gemma-4-26b-a4b", "google.vertex.chat")).not.toContain(
    vertexGemma4ThinkingMiddleware,
  );
});

test("vertexGemma4ThinkingMiddleware > enable_thinking reaches the provider", async () => {
  const chain = modelMiddlewareMatcher.for("google/gemma-4-26b-a4b", "vertex.maas.chat");
  const model = new MockLanguageModelV4({
    modelId: "google/gemma-4-26b-a4b-it-maas",
    provider: "vertex.maas.chat",
  });

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
    } as LanguageModelV4CallOptions),
  );

  expect(params.providerOptions).toEqual({
    vertex: { chat_template_kwargs: { enable_thinking: true } },
  });
});

// ---------------------------------------------------------------------------
// Gemini 3 thought signatures replayed from a tool call's extra_content (#283)
// ---------------------------------------------------------------------------

/** Sends a replayed tool call through the real Vertex Gemini provider and captures the body. */
async function captureReplayedFunctionCall(extraContent: Record<string, Record<string, string>>) {
  type Body = { contents: { role: string; parts: Record<string, unknown>[] }[] };
  let body: Body | undefined;
  const vertex = createVertex({
    apiKey: "test-key",
    fetch: ((_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(init?.body as string) as Body;
      throw new Error("captured");
    }) as unknown as typeof fetch,
  });
  const model = wrapLanguageModel({
    model: vertex.languageModel("gemini-3-flash-preview"),
    middleware: forwardParamsMiddleware("google.vertex.chat"),
  });

  const assistant = fromChatCompletionsAssistantMessage({
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"Paris"}' },
        extra_content: extraContent,
      },
    ],
  });

  try {
    await model.doGenerate({
      prompt: [
        { role: "user", content: [{ type: "text", text: "Weather in Paris?" }] },
        assistant as LanguageModelV4CallOptions["prompt"][number],
      ],
    });
  } catch {
    // expected
  }

  return body!.contents.find((c) => c.role === "model")!.parts[0]!;
}

test("vertex Gemini 3 > forwards the thought signature echoed back in extra_content", async () => {
  // The exact shape the gateway emits on a Vertex tool call.
  const part = await captureReplayedFunctionCall({
    googleVertex: { thought_signature: "real-sig" },
    vertex: { thought_signature: "real-sig" },
  });

  expect(part["thoughtSignature"]).toBe("real-sig");
});

test("vertex Gemini 3 > forwards an invalid signature instead of the skip sentinel", async () => {
  const part = await captureReplayedFunctionCall({
    googleVertex: { thought_signature: "invalid" },
    vertex: { thought_signature: "invalid" },
  });

  expect(part["thoughtSignature"]).toBe("invalid");
});
