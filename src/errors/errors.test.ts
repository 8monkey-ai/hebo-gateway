import { describe, expect, test } from "bun:test";

import { APICallError, RetryError } from "ai";

import { normalizeAiSdkError } from "./ai-sdk";
import { toAnthropicError } from "./anthropic";
import { GatewayError } from "./gateway";
import { getErrorMeta } from "./utils";

describe("GatewayError", () => {
  test("carries headers when provided", () => {
    const headers = { "retry-after": "5", "x-should-retry": "true" };
    const error = new GatewayError("test", 429, "TOO_MANY_REQUESTS", undefined, headers);
    expect(error.headers).toEqual(headers);
  });

  test("sets x-should-retry false for non-upstream errors", () => {
    const error = new GatewayError("test", 500);
    expect(error.headers).toEqual({ "x-should-retry": "false" });
  });

  test("does not override headers for upstream errors", () => {
    const headers = { "retry-after": "5" };
    const error = new GatewayError("test", 502, "UPSTREAM_BAD_GATEWAY", undefined, headers);
    expect(error.headers).toEqual({ "retry-after": "5" });
  });
});

describe("normalizeAiSdkError", () => {
  test("passes responseHeaders from APICallError as headers", () => {
    const apiError = new APICallError({
      message: "Too many requests",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { "retry-after": "2", "retry-after-ms": "2000" },
      responseBody: "rate limited",
    });

    const normalized = normalizeAiSdkError(apiError);
    expect(normalized).toBeInstanceOf(GatewayError);
    expect(normalized!.status).toBe(429);
    expect(normalized!.headers).toEqual({ "retry-after": "2", "retry-after-ms": "2000" });
  });

  test("passes responseHeaders from RetryError wrapping APICallError as headers", () => {
    const apiError = new APICallError({
      message: "Service unavailable",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 503,
      responseHeaders: { "retry-after": "10" },
      responseBody: "unavailable",
    });

    const retryError = new RetryError({
      message: "Max retries exceeded",
      reason: "maxRetriesExceeded",
      errors: [apiError],
    });

    const normalized = normalizeAiSdkError(retryError);
    expect(normalized).toBeInstanceOf(GatewayError);
    expect(normalized!.status).toBe(503);
    expect(normalized!.headers).toEqual({ "retry-after": "10" });
  });

  test("handles RetryError without APICallError inner error", () => {
    const retryError = new RetryError({
      message: "Max retries exceeded",
      reason: "maxRetriesExceeded",
      errors: [new Error("generic error")],
    });

    const normalized = normalizeAiSdkError(retryError);
    expect(normalized).toBeInstanceOf(GatewayError);
    expect(normalized!.status).toBe(502);
    expect(normalized!.headers).toBeUndefined();
  });

  test("handles APICallError without responseHeaders", () => {
    const apiError = new APICallError({
      message: "Bad request",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 400,
    });

    const normalized = normalizeAiSdkError(apiError);
    expect(normalized!.headers).toBeUndefined();
  });

  test("maps AbortError (upstream timeout) to 504 gateway timeout", () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");

    const normalized = normalizeAiSdkError(abortError);
    expect(normalized).toBeInstanceOf(GatewayError);
    expect(normalized!.status).toBe(504);
    expect(normalized!.statusText).toBe("UPSTREAM_GATEWAY_TIMEOUT");
  });

  test("maps TimeoutError (AbortSignal.timeout) to 504 gateway timeout", () => {
    const timeoutError = new DOMException("Signal timed out.", "TimeoutError");

    const normalized = normalizeAiSdkError(timeoutError);
    expect(normalized).toBeInstanceOf(GatewayError);
    expect(normalized!.status).toBe(504);
    expect(normalized!.statusText).toBe("UPSTREAM_GATEWAY_TIMEOUT");
  });
});

describe("getErrorMeta", () => {
  test("includes headers from GatewayError", () => {
    const headers = { "retry-after-ms": "1000" };
    const error = new GatewayError("test", 429, "TOO_MANY_REQUESTS", undefined, headers);
    const meta = getErrorMeta(error);
    expect(meta.headers).toEqual(headers);
  });

  test("includes headers from normalized APICallError", () => {
    const apiError = new APICallError({
      message: "Rate limited",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: { "retry-after": "3" },
      responseBody: "",
    });

    const meta = getErrorMeta(apiError);
    expect(meta.status).toBe(429);
    expect(meta.headers).toEqual({ "retry-after": "3" });
  });

  test("headers is empty for non-API errors", () => {
    const meta = getErrorMeta(new Error("something broke"));
    expect(meta.headers).toEqual({});
  });

  test("gateway-originated errors carry x-should-retry false", () => {
    const error = new GatewayError("Model not found", 422, "MODEL_NOT_FOUND");
    const meta = getErrorMeta(error);
    expect(meta.headers).toEqual({ "x-should-retry": "false" });
  });
});

describe("toAnthropicError", () => {
  test("passes through already-Anthropic-shaped payloads without clobbering type/message", () => {
    // MessagesTransformStream emits this shape verbatim from upstream stream errors.
    // toSseStream then feeds it back through toAnthropicError — regression for #213.
    const streamPayload = {
      type: "error" as const,
      error: {
        type: "invalid_request_error",
        message:
          "Unable to submit request because function call `check_availability` is missing a `thought_signature`.",
      },
    };

    const result = toAnthropicError(streamPayload);
    expect(result.error.type).toBe("invalid_request_error");
    expect(result.error.message).toBe(streamPayload.error.message);
    expect(result.error.message).not.toBe("[object Object]");
  });

  test("preserves api_error type from streaming payloads", () => {
    const streamPayload = {
      type: "error" as const,
      error: { type: "api_error", message: "upstream failed" },
    };

    const result = toAnthropicError(streamPayload);
    expect(result.error.type).toBe("api_error");
    expect(result.error.message).toBe("upstream failed");
  });

  test("still handles regular Error instances via existing path", () => {
    const result = toAnthropicError(new Error("boom"));
    expect(result.error.type).toBe("api_error");
    expect(result.error.message).toBe("boom");
  });

  test("still handles GatewayError with 4xx status via existing path", () => {
    const result = toAnthropicError(new GatewayError("bad input", 400));
    expect(result.error.type).toBe("invalid_request_error");
    expect(result.error.message).toBe("bad input");
  });
});
