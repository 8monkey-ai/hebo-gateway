import { describe, expect, test } from "bun:test";

import { APICallError, RetryError } from "ai";

import { normalizeAiSdkError } from "./ai-sdk";
import { toAnthropicErrorResponse } from "./anthropic";
import { GatewayError } from "./gateway";
import { toOpenAIErrorResponse } from "./openai";
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

  test("uses status from foreign HTTP errors", () => {
    const meta = getErrorMeta(Object.assign(new Error("NOT_FOUND"), { status: 404 }));
    expect(meta.status).toBe(404);
    expect(meta.statusText).toBe("NOT_FOUND");
  });

  test("ignores non-error status on foreign errors", () => {
    expect(getErrorMeta(Object.assign(new Error("x"), { status: 200 })).status).toBe(500);
    expect(getErrorMeta(Object.assign(new Error("x"), { status: "404" })).status).toBe(500);
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

describe("error response helpers", () => {
  const helpers = [
    ["openai", toOpenAIErrorResponse],
    ["anthropic", toAnthropicErrorResponse],
  ] as const;

  for (const [name, toErrorResponse] of helpers) {
    describe(name, () => {
      test("defaults to 500 when no status is passed", () => {
        const res = toErrorResponse(new Error("boom"), {});
        expect(res.status).toBe(500);
        expect(res.statusText).toBe("INTERNAL_SERVER_ERROR");
      });

      test("defaults to 500 when init is omitted", () => {
        expect(toErrorResponse(new Error("boom")).status).toBe(500);
      });

      test("uses the status of a GatewayError", () => {
        const res = toErrorResponse(new GatewayError("nope", 404), {});
        expect(res.status).toBe(404);
        expect(res.statusText).toBe("NOT_FOUND");
      });

      test("uses the status of a foreign error", () => {
        const res = toErrorResponse(Object.assign(new Error("NOT_FOUND"), { status: 404 }), {});
        expect(res.status).toBe(404);
        expect(res.statusText).toBe("NOT_FOUND");
      });

      test("ignores non-error statuses on init and error", () => {
        const res = toErrorResponse(Object.assign(new Error("x"), { status: 200 }), {
          status: 200,
        });
        expect(res.status).toBe(500);
      });

      test("explicit init.status wins and derives statusText", () => {
        const res = toErrorResponse(new GatewayError("x", 429), { status: 404 });
        expect(res.status).toBe(404);
        expect(res.statusText).toBe("NOT_FOUND");
      });

      test("preserves init headers", () => {
        const res = toErrorResponse(new Error("x"), { headers: { "x-request-id": "req_1" } });
        expect(res.headers.get("x-request-id")).toBe("req_1");
      });
    });
  }

  test("openai code follows the resolved status", async () => {
    const res = toOpenAIErrorResponse(new Error("x"), { status: 404 });
    expect(await res.json()).toEqual({
      error: {
        message: "x",
        type: "invalid_request_error",
        code: "not_found",
        param: "",
      },
    });
  });

  test("openai code uses upstream status text from the error", async () => {
    const res = toOpenAIErrorResponse(new GatewayError("x", 502, "UPSTREAM_BAD_GATEWAY"), {});
    const body = (await res.json()) as { error: { code: string; type: string } };
    expect(res.status).toBe(502);
    expect(body.error.code).toBe("upstream_bad_gateway");
    expect(body.error.type).toBe("server_error");
  });

  test("anthropic type follows the resolved status", async () => {
    const res = toAnthropicErrorResponse(Object.assign(new Error("x"), { status: 404 }), {});
    expect(await res.json()).toEqual({
      type: "error",
      error: { type: "not_found_error", message: "x" },
    });
  });
});
