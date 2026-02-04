import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { extractProviderNamespace, forwardParamsMiddleware } from "./common";

describe("extractProviderNamespace", () => {
  test("should handle simple names", () => {
    expect(extractProviderNamespace("openai")).toBe("openai");
    expect(extractProviderNamespace("anthropic")).toBe("anthropic");
  });

  test("should handle dot-separated names", () => {
    expect(extractProviderNamespace("google.vertex")).toBe("vertex");
    expect(extractProviderNamespace("google.vertex.chat")).toBe("vertex");
    expect(extractProviderNamespace("azure.openai")).toBe("openai");
  });

  test("should handle dash-separated names", () => {
    expect(extractProviderNamespace("amazon-bedrock")).toBe("bedrock");
    expect(extractProviderNamespace("google-vertex")).toBe("vertex");
  });

  test("should handle mixed separators", () => {
    expect(extractProviderNamespace("company.service-name")).toBe("name");
  });
});

describe("forwardParamsMiddleware", () => {
  test("should snakize providerMetadata in generate output", async () => {
    const middleware = forwardParamsMiddleware("google.vertex.chat");
    const model = new MockLanguageModelV3({
      modelId: "google/gemini-2.5-flash",
      doGenerate: async () => ({
        content: [{ type: "text", text: "hi" }],
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
        providerMetadata: {
          vertex: {
            thoughtSignature: "encrypted-signature",
          },
        },
        warnings: [],
      }),
    });

    const result = await middleware.wrapGenerate!({
      model,
      params: { prompt: [] },
      doGenerate: () => model.doGenerate({ prompt: [] }),
      doStream: () => model.doStream({ prompt: [] }),
    });

    expect(result.providerMetadata).toEqual({
      vertex: {
        thought_signature: "encrypted-signature",
      },
    });
  });

  test("should snakize providerMetadata in generate output content parts", async () => {
    const middleware = forwardParamsMiddleware("google.vertex.chat");
    const model = new MockLanguageModelV3({
      modelId: "google/gemini-2.5-flash",
      doGenerate: async () => ({
        content: [
          {
            type: "text",
            text: "hi",
            providerMetadata: { vertex: { thoughtSignature: "part-sig" } },
          },
        ],
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
        warnings: [],
      }),
    });

    const result = await middleware.wrapGenerate!({
      model,
      params: { prompt: [] },
      doGenerate: () => model.doGenerate({ prompt: [] }),
      doStream: () => model.doStream({ prompt: [] }),
    });

    expect(result.content[0].providerMetadata).toEqual({
      vertex: {
        thought_signature: "part-sig",
      },
    });
  });

  test("should snakize providerMetadata in stream parts", async () => {
    const middleware = forwardParamsMiddleware("google.vertex.chat");
    const model = new MockLanguageModelV3({
      modelId: "google/gemini-2.5-flash",
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "text-delta",
              id: "1",
              delta: "hi",
              providerMetadata: { vertex: { thoughtSignature: "part-signature" } },
            });
            controller.enqueue({
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 1, completionTokens: 1 },
            });
            controller.close();
          },
        }),
      }),
    });

    const result = await middleware.wrapStream!({
      model,
      params: { prompt: [] },
      doGenerate: () => model.doGenerate({ prompt: [] }),
      doStream: () => model.doStream({ prompt: [] }),
    });

    const reader = result.stream.getReader();
    const part = await reader.read();
    expect(part.value.providerMetadata).toEqual({
      vertex: { thought_signature: "part-signature" },
    });
  });

  test("should camelize providerOptions on the way in", async () => {
    const middleware = forwardParamsMiddleware("google.vertex.chat");
    const params = {
      prompt: [],
      providerOptions: {
        vertex: { thought_signature: "in-signature" },
      },
    };

    const result = await middleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-flash" }),
    });

    expect(result.providerOptions).toEqual({
      vertex: { thoughtSignature: "in-signature" },
    });
  });
});
