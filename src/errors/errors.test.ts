import { describe, expect, test } from "bun:test";

import { APICallError, RetryError } from "ai";

import { normalizeAiSdkError } from "./ai-sdk";
import { GatewayError } from "./gateway";
import { getErrorMeta } from "./utils";

describe("GatewayError", () => {
  test("carries headers when provided", () => {
    const headers = { "retry-after": "5", "x-should-retry": "true" };
    const error = new GatewayError("test", 429, "TOO_MANY_REQUESTS", undefined, headers);
    expect(error.headers).toEqual(headers);
  });

  test("headers defaults to undefined", () => {
    const error = new GatewayError("test", 500);
    expect(error.headers).toBeUndefined();
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

  test("headers is undefined for non-API errors", () => {
    const meta = getErrorMeta(new Error("something broke"));
    expect(meta.headers).toBeUndefined();
  });

  test("headers is undefined for gateway-originated errors", () => {
    const error = new GatewayError("Model not found", 422, "MODEL_NOT_FOUND");
    const meta = getErrorMeta(error);
    expect(meta.headers).toBeUndefined();
  });
});
