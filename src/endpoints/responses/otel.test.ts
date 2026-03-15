import { describe, expect, test } from "bun:test";

import type { ResponsesBody, ResponsesResponse } from "./schema";

import { getResponsesRequestAttributes, getResponsesResponseAttributes } from "./otel";

describe("Responses OTEL", () => {
  test("should map request metadata into per-key attributes", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-oss-20b",
      input: "hi",
      metadata: {
        tenant: "acme",
        "Org ID": "o-123",
      },
    };

    const attrs = getResponsesRequestAttributes(body, "recommended");

    expect(attrs["gen_ai.request.metadata.tenant"]).toBe("acme");
    expect(attrs["gen_ai.request.metadata.Org ID"]).toBe("o-123");
  });

  test("should stringify tool definitions", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-oss-20b",
      input: "hi",
      tools: [
        {
          type: "function",
          name: "get_weather",
          parameters: { type: "object", properties: { location: { type: "string" } } },
        },
      ],
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    expect(attrs["gen_ai.tool.definitions"]).toEqual([
      JSON.stringify({
        type: "function",
        function: {
          name: "get_weather",
          description: undefined,
          parameters: { type: "object", properties: { location: { type: "string" } } },
        },
      }),
    ]);
  });

  test("should map string input to user message in request attributes", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-oss-20b",
      input: "hello world",
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [{ type: "text", content: "hello world" }],
      }),
    ]);
  });

  test("should include instructions as system message in request attributes", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-oss-20b",
      input: "hi",
      instructions: "Be concise",
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    const messages = attrs["gen_ai.input.messages"] as string[];
    expect(messages[0]).toBe(
      JSON.stringify({
        role: "system",
        parts: [{ type: "text", content: "Be concise" }],
      }),
    );
  });

  test("should map response output items in response attributes", () => {
    const response: ResponsesResponse = {
      id: "resp_123",
      object: "response",
      status: "completed",
      model: "openai/gpt-oss-20b",
      output: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "hello" }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
      created_at: 1700000000,
    };

    const attrs = getResponsesResponseAttributes(response, "full");

    expect(attrs["gen_ai.output.messages"]).toEqual([
      JSON.stringify({
        role: "message",
        parts: [{ type: "text", content: "hello" }],
      }),
    ]);
  });

  test("should map usage token attributes", () => {
    const response: ResponsesResponse = {
      id: "resp_123",
      object: "response",
      status: "completed",
      model: "openai/gpt-oss-20b",
      output: [],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        input_tokens_details: { cached_tokens: 4 },
        output_tokens_details: { reasoning_tokens: 6 },
      },
      created_at: 1700000000,
    };

    const attrs = getResponsesResponseAttributes(response, "recommended");

    expect(attrs["gen_ai.usage.input_tokens"]).toBe(10);
    expect(attrs["gen_ai.usage.output_tokens"]).toBe(20);
    expect(attrs["gen_ai.usage.total_tokens"]).toBe(30);
    expect(attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(4);
    expect(attrs["gen_ai.usage.reasoning.output_tokens"]).toBe(6);
  });

  test("should return empty object when signal level is off", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-oss-20b",
      input: "hi",
    };
    expect(getResponsesRequestAttributes(body, "off")).toEqual({});
  });
});
