import { describe, expect, test } from "bun:test";

import { GatewayError } from "../../errors/gateway";
import {
  parseJsonOrText,
  parseBase64,
  parseFileInput,
  parseImageInput,
  parseReasoningOptions,
  parsePromptCachingOptions,
  resolveResponseServiceTier,
  normalizeToolName,
  stripEmptyKeys,
  extractReasoningMetadata,
  isOpenAIReasoningFormat,
  toReasoningFormat,
} from "./converters";

describe("Shared Converters", () => {
  describe("parseJsonOrText", () => {
    test("should parse valid JSON", () => {
      const input = '{"a": 1}';
      expect(parseJsonOrText(input)).toEqual({ type: "json", value: { a: 1 } });
    });

    test("should return text for invalid JSON", () => {
      const input = "not a json";
      expect(parseJsonOrText(input)).toEqual({ type: "text", value: "not a json" });
    });
  });

  describe("parseBase64", () => {
    test("should parse valid base64", () => {
      const input = "SGVsbG8="; // "Hello"
      const result = parseBase64(input);
      expect(new TextDecoder().decode(result)).toBe("Hello");
    });

    test("should throw GatewayError for invalid base64", () => {
      expect(() => parseBase64("!!!")).toThrow(GatewayError);
    });
  });

  describe("parseImageInput", () => {
    test("should parse data URL", () => {
      const url =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      const result = parseImageInput(url);
      expect(result.mediaType).toBe("image/png");
      expect(result.image).toBe(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      );
    });

    test("should throw for invalid data URL", () => {
      expect(() => parseImageInput("data:image/png;base64")).toThrow(GatewayError);
    });

    test("should throw for unsupported media type", () => {
      expect(() => parseImageInput("data:text/plain;base64,SGVsbG8=")).toThrow(GatewayError);
    });

    test("should parse standard URL", () => {
      const url = "https://example.com/image.png";
      const result = parseImageInput(url);
      expect(result.image).toBeInstanceOf(URL);
      expect((result.image as URL).href).toBe(url);
    });

    test("should throw for invalid URL", () => {
      expect(() => parseImageInput("not-a-url")).toThrow(GatewayError);
    });
  });

  describe("parseFileInput", () => {
    test("should take the media type from a data URL", () => {
      expect(parseFileInput("data:application/pdf;base64,SGVsbG8=")).toEqual({
        data: "SGVsbG8=",
        mediaType: "application/pdf",
      });
    });

    test("should accept any media type, unlike parseImageInput", () => {
      expect(parseFileInput("data:text/csv;base64,SGVsbG8=").mediaType).toBe("text/csv");
    });

    test("should leave bare base64 untouched with no media type", () => {
      expect(parseFileInput("SGVsbG8=")).toEqual({ data: "SGVsbG8=" });
    });

    test("should throw for a data URL with no payload", () => {
      expect(() => parseFileInput("data:application/pdf;base64,")).toThrow(GatewayError);
    });

    test("should throw for a data URL with no media type", () => {
      expect(() => parseFileInput("data:,SGVsbG8=")).toThrow(GatewayError);
    });
  });

  describe("parseReasoningOptions", () => {
    test("should return disabled when enabled is false", () => {
      expect(parseReasoningOptions(undefined, { enabled: false })).toEqual({
        reasoning: { enabled: false, effort: "none" },
        reasoning_effort: "none",
      });
    });

    test("should return disabled when effort is none", () => {
      expect(parseReasoningOptions("none")).toEqual({
        reasoning: { enabled: false, effort: "none" },
        reasoning_effort: "none",
      });
    });

    test("should parse effort and max_tokens", () => {
      const result = parseReasoningOptions("medium", { max_tokens: 1000 });
      expect(result).toEqual({
        reasoning: { enabled: true, effort: "medium", max_tokens: 1000 },
        reasoning_effort: "medium",
      });
    });

    test("should handle undefined inputs", () => {
      expect(parseReasoningOptions()).toEqual({});
    });

    test("should handle null inputs", () => {
      expect(parseReasoningOptions(null, null)).toEqual({});
      expect(parseReasoningOptions(null)).toEqual({});
      expect(parseReasoningOptions(undefined, null)).toEqual({});
    });
  });

  describe("parsePromptCachingOptions", () => {
    test("should parse prompt_cache_key and retention", () => {
      const result = parsePromptCachingOptions("key", "24h");
      expect(result).toEqual({
        prompt_cache_key: "key",
        prompt_cache_retention: "24h",
        cache_control: { type: "ephemeral", ttl: "24h" },
      });
    });

    test("should infer retention from cache_control", () => {
      const result = parsePromptCachingOptions(undefined, undefined, {
        type: "ephemeral",
        ttl: "24h",
      });
      expect(result).toEqual({
        prompt_cache_retention: "24h",
        cache_control: { type: "ephemeral", ttl: "24h" },
      });
    });
  });

  describe("resolveResponseServiceTier", () => {
    test("should resolve tier from provider metadata", () => {
      const metadata = {
        openai: { service_tier: "scale" },
      };
      expect(resolveResponseServiceTier(metadata)).toBe("scale");
    });

    test("should resolve tier from usage_metadata traffic_type", () => {
      const metadata = {
        google: { usage_metadata: { traffic_type: "on_demand_priority" } },
      };
      expect(resolveResponseServiceTier(metadata)).toBe("priority");
    });

    test("should return undefined if no metadata", () => {
      expect(resolveResponseServiceTier()).toBeUndefined();
    });
  });

  describe("normalizeToolName", () => {
    test("should normalize invalid characters to underscore", () => {
      expect(normalizeToolName("my-tool!")).toBe("my-tool_");
    });

    test("should allow valid characters", () => {
      expect(normalizeToolName("my_Tool.123-")).toBe("my_Tool.123-");
    });

    test("should truncate to 128 characters", () => {
      const longName = "a".repeat(200);
      expect(normalizeToolName(longName).length).toBe(128);
    });
  });

  describe("stripEmptyKeys", () => {
    test("should remove empty string key for JSON serialization", () => {
      const obj = { "": "empty", a: 1 };
      const result = stripEmptyKeys(obj);
      expect(JSON.stringify(result)).toBe('{"a":1}');
    });

    test("should not affect other keys", () => {
      const obj = { a: 1, b: 2 };
      const result = stripEmptyKeys(obj);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    test("should handle non-object inputs", () => {
      expect(stripEmptyKeys(null)).toBe(null);
      expect(stripEmptyKeys("string")).toBe("string");
      expect(stripEmptyKeys(123)).toBe(123);
      expect(stripEmptyKeys([])).toEqual([]);
    });
  });

  describe("extractReasoningMetadata", () => {
    test("should extract redactedData and signature", () => {
      const metadata = {
        provider: { redactedData: "data", signature: "sig" },
      };
      expect(extractReasoningMetadata(metadata)).toMatchObject({
        redactedData: "data",
        signature: "sig",
      });
    });

    test("should return only the format if nothing was found", () => {
      expect(extractReasoningMetadata({})).toEqual({ format: "unknown" });
      expect(extractReasoningMetadata()).toEqual({ format: "unknown" });
    });

    test("should extract OpenAI encrypted reasoning and item id", () => {
      expect(
        extractReasoningMetadata({
          openai: { itemId: "rs_123", reasoningEncryptedContent: "enc" },
        }),
      ).toMatchObject({
        itemId: "rs_123",
        encryptedContent: "enc",
        format: "openai-responses-v1",
      });
    });

    test("should accept snakized metadata as emitted on the response path", () => {
      expect(
        extractReasoningMetadata({
          openai: { item_id: "rs_123", reasoning_encrypted_content: "enc" },
        }),
      ).toMatchObject({ itemId: "rs_123", encryptedContent: "enc" });
      expect(extractReasoningMetadata({ vertex: { thought_signature: "sig" } })).toMatchObject({
        thoughtSignature: "sig",
        format: "google-gemini-v1",
      });
    });

    test("should derive the format tag from the provider namespace", () => {
      expect(toReasoningFormat("anthropic")).toBe("anthropic-claude-v1");
      expect(toReasoningFormat("bedrock")).toBe("anthropic-claude-v1");
      expect(toReasoningFormat("amazonBedrock")).toBe("anthropic-claude-v1");
      expect(toReasoningFormat("google")).toBe("google-gemini-v1");
      expect(toReasoningFormat("vertex")).toBe("google-gemini-v1");
      expect(toReasoningFormat("googleVertex")).toBe("google-gemini-v1");
      expect(toReasoningFormat("openai")).toBe("openai-responses-v1");
      expect(toReasoningFormat("azure")).toBe("azure-openai-responses-v1");
      expect(toReasoningFormat("xai")).toBe("xai-responses-v1");
      expect(toReasoningFormat("somethingelse")).toBe("unknown");
    });

    test("should report the format even when no blob is present", () => {
      expect(extractReasoningMetadata({ anthropic: {} })).toEqual({
        format: "anthropic-claude-v1",
      });
    });
  });

  describe("isOpenAIReasoningFormat", () => {
    test("should cover every OpenAI-hosted variant", () => {
      expect(isOpenAIReasoningFormat("openai-responses-v1")).toBe(true);
      expect(isOpenAIReasoningFormat("azure-openai-responses-v1")).toBe(true);
      expect(isOpenAIReasoningFormat("bedrock-openai-responses-v1")).toBe(true);
      expect(isOpenAIReasoningFormat("anthropic-claude-v1")).toBe(false);
      expect(isOpenAIReasoningFormat("google-gemini-v1")).toBe(false);
      expect(isOpenAIReasoningFormat("unknown")).toBe(false);
      expect(isOpenAIReasoningFormat()).toBe(false);
    });
  });
});
