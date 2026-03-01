import { describe, expect, test } from "bun:test";

import type { ChatCompletionsBody } from "./schema";

import { getChatRequestAttributes } from "./otel";

describe("Chat Completions OTEL", () => {
  test("should stringify each tool definition individually", () => {
    const tool1 = {
      type: "function" as const,
      function: {
        name: "get_weather",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      },
    };

    const tool2 = {
      type: "function" as const,
      function: {
        name: "get_time",
        parameters: {
          type: "object",
          properties: {
            timezone: { type: "string" },
          },
        },
      },
    };

    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hi" }],
      tools: [tool1, tool2],
    };

    const attrs = getChatRequestAttributes(inputs, "full");

    expect(attrs["gen_ai.tool.definitions"]).toEqual([
      JSON.stringify(tool1),
      JSON.stringify(tool2),
    ]);
  });
});
