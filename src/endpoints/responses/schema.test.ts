import { describe, expect, test } from "bun:test";

import { ResponsesBodySchema } from "./schema";

describe("ResponsesBodySchema", () => {
  test("accepts reasoning items with nullable fields (Codex follow-up payload)", () => {
    const body = {
      model: "sonnet-lak/main/default",
      instructions: "You are a coding agent.",
      input: [
        { type: "message", role: "user", content: "first message" },
        {
          type: "reasoning",
          id: "rs_123",
          summary: [{ type: "summary_text", text: "thinking..." }],
          content: null,
          encrypted_content: null,
          status: null,
        },
        {
          type: "message",
          role: "assistant",
          id: "msg_123",
          status: null,
          content: [
            {
              type: "output_text",
              text: "first reply",
              annotations: null,
            },
          ],
        },
        { type: "message", role: "user", content: "follow-up message" },
      ],
    };

    const parsed = ResponsesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts function call items with nullable optional fields", () => {
    const body = {
      model: "sonnet-lak/main/default",
      input: [
        {
          type: "function_call",
          id: null,
          call_id: "call_123",
          name: "search_docs",
          arguments: "{}",
          status: null,
          extra_content: null,
          cache_control: null,
        },
        {
          type: "function_call_output",
          id: null,
          call_id: "call_123",
          output: "ok",
          status: null,
          extra_content: null,
          cache_control: null,
        },
      ],
    };

    const parsed = ResponsesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts input_image content parts with nullable sibling fields", () => {
    const body = {
      model: "sonnet-lak/main/default",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: "https://example.com/cat.png",
              file_id: null,
              detail: null,
            },
            {
              type: "input_image",
              file_id: "file_abc",
              image_url: null,
              detail: null,
            },
          ],
        },
      ],
    };

    const parsed = ResponsesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  test("accepts input_file content parts with nullable sibling fields", () => {
    const body = {
      model: "sonnet-lak/main/default",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_file",
              file_data: "base64data",
              file_id: null,
              file_url: null,
              filename: null,
            },
            {
              type: "input_file",
              file_id: "file_abc",
              file_data: null,
              file_url: null,
              filename: null,
            },
            {
              type: "input_file",
              file_url: "https://example.com/doc.pdf",
              file_data: null,
              file_id: null,
              filename: null,
            },
          ],
        },
      ],
    };

    const parsed = ResponsesBodySchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
