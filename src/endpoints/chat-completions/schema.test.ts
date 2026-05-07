import { describe, expect, test } from "bun:test";

import { ChatCompletionsBodySchema } from "./schema";

describe("ChatCompletionsBodySchema", () => {
  test("accepts assistant message with nullable extension fields (round-trip echo)", () => {
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "hi", name: null, cache_control: null },
        {
          role: "assistant",
          content: "hello",
          name: null,
          tool_calls: null,
          reasoning: null,
          reasoning_details: null,
          extra_content: null,
          cache_control: null,
        },
      ],
    };

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts assistant message with reasoning_details whose fields are all null", () => {
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: "",
          reasoning_details: [
            {
              id: null,
              index: 0,
              type: "reasoning.text",
              text: null,
              signature: null,
              data: null,
              summary: null,
              format: null,
            },
          ],
        },
      ],
    };

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts tool_call with null extra_content", () => {
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "search", arguments: "{}" },
              extra_content: null,
            },
          ],
        },
      ],
    };

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts user content parts with nullable optional fields", () => {
    const body = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hi", cache_control: null },
            {
              type: "image_url",
              image_url: { url: "https://example.com/a.png", detail: null },
              cache_control: null,
            },
            {
              type: "file",
              file: {
                data: "ZmlsZQ==",
                media_type: "application/pdf",
                filename: null,
              },
              cache_control: null,
            },
            {
              type: "input_audio",
              input_audio: { data: "YXVkaW8=", format: "mp3" },
              cache_control: null,
            },
          ],
        },
      ],
    };

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts system/user messages with null name and cache_control", () => {
    const body = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: "sys", name: null, cache_control: null },
        { role: "user", content: "hi", name: null, cache_control: null },
      ],
    };

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
