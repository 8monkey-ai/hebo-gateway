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
});
