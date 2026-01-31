import { describe, expect, test } from "bun:test";

import { convertToTextCallOptions } from "./converters";

describe("Chat Completions Converters", () => {
  describe("convertToTextCallOptions", () => {
    test("should use max_completion_tokens when present", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        max_completion_tokens: 200,
      });
      expect(result.maxOutputTokens).toBe(200);
    });

    test("should use max_tokens when max_completion_tokens is absent", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 100,
      });
      expect(result.maxOutputTokens).toBe(100);
    });

    test("should favor max_completion_tokens over max_tokens when both are present", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 100,
        max_completion_tokens: 200,
      });
      expect(result.maxOutputTokens).toBe(200);
    });

    test("should handle neither being present", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result.maxOutputTokens).toBeUndefined();
    });
  });
});
