import { describe, expect, test } from "bun:test";

import { MessagesBodySchema } from "./schema";

describe("MessagesBodySchema", () => {
  test("accepts text/image blocks with null cache_control", () => {
    const body = {
      model: "claude-sonnet-4",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hi", cache_control: null },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "aW1n",
              },
              cache_control: null,
            },
          ],
        },
      ],
    };

    const parsed = MessagesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts document block with null title/context/cache_control", () => {
    const body = {
      model: "claude-sonnet-4",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "url", url: "https://example.com/a.pdf" },
              title: null,
              context: null,
              cache_control: null,
            },
          ],
        },
      ],
    };

    const parsed = MessagesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts tool_use assistant block with null caller/extra_content", () => {
    const body = {
      model: "claude-sonnet-4",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "search",
              input: {},
              caller: null,
              extra_content: null,
            },
          ],
        },
      ],
    };

    const parsed = MessagesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts tool_result block with null content/is_error/cache_control", () => {
    const body = {
      model: "claude-sonnet-4",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              content: null,
              is_error: null,
              cache_control: null,
            },
          ],
        },
      ],
    };

    const parsed = MessagesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts system block array with null cache_control", () => {
    const body = {
      model: "claude-sonnet-4",
      max_tokens: 1024,
      system: [{ type: "text", text: "you are helpful", cache_control: null }],
      messages: [{ role: "user", content: "hi" }],
    };

    const parsed = MessagesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
