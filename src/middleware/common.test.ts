import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { forwardParamsMiddleware } from "./common";

describe("forwardParamsMiddleware", () => {
  test("should snakize providerMetadata in generate output", async () => {
    const middleware = forwardParamsMiddleware("google");
    const model = new MockLanguageModelV3({
      modelId: "google/gemini-2.5-flash",
      doGenerate: async () => ({
        content: [{ type: "text", text: "hi" }],
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
        providerMetadata: {
          google: {
            thoughtSignature: "encrypted-signature",
            nestedField: { someValue: 123 },
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
      google: {
        thought_signature: "encrypted-signature",
        nested_field: { some_value: 123 },
      },
    });
  });

  test("should snakize providerMetadata in stream parts", async () => {
    const middleware = forwardParamsMiddleware("google");
    const model = new MockLanguageModelV3({
      modelId: "google/gemini-2.5-flash",
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "text-delta",
              id: "1",
              delta: "hi",
              providerMetadata: { google: { thoughtSignature: "part-signature" } },
            });
            controller.enqueue({
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 1, completionTokens: 1 },
              providerMetadata: { google: { finalSignature: "final-signature" } },
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
    const part1 = await reader.read();
    expect(part1.value.providerMetadata).toEqual({
      google: { thought_signature: "part-signature" },
    });

    const part2 = await reader.read();
    expect(part2.value.providerMetadata).toEqual({
      google: { final_signature: "final-signature" },
    });
  });

  test("should camelize providerOptions on the way in", async () => {
    const middleware = forwardParamsMiddleware("google");
    const params = {
      prompt: [],
      providerOptions: {
        unknown: {
          extra_content: { google: { thought_signature: "in-signature" } },
          some_param: "value",
        },
      },
    };

    const result = await middleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-flash" }),
    });

    expect(result.providerOptions!.google).toEqual({
      extraContent: { google: { thoughtSignature: "in-signature" } },
      someParam: "value",
    });
  });
});
