import { describe, expect, test } from "bun:test";
import {
  parseJsonOrText,
  parseBase64,
  parseImageInput,
  parseReasoningOptions,
  parsePromptCachingOptions,
  resolveResponseServiceTier,
  normalizeToolName,
  stripEmptyKeys,
  extractReasoningMetadata,
} from "./converters";
import { GatewayError } from "../../errors/gateway";

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

  describe("parseReasoningOptions", () => {
    test("should return disabled when enabled is false", () => {
      expect(parseReasoningOptions(undefined, { enabled: false })).toEqual({
        reasoning: { enabled: false },
        reasoning_effort: "none",
      });
    });

    test("should return disabled when effort is none", () => {
      expect(parseReasoningOptions("none")).toEqual({
        reasoning: { enabled: false },
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
      expect(extractReasoningMetadata(metadata)).toEqual({
        redactedData: "data",
        signature: "sig",
      });
    });

    test("should return empty object if not found", () => {
      expect(extractReasoningMetadata({})).toEqual({});
      expect(extractReasoningMetadata()).toEqual({});
    });
  });
});
