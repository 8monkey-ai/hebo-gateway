import { describe, expect, test } from "bun:test";

import {
  buildRetryHeaders,
  filterResponseHeaders,
  prepareResponseInit,
  toResponse,
} from "./response";

describe("toResponse", () => {
  test("serializes JSON objects", async () => {
    const response = toResponse({ hello: "world" });

    expect(await response.text()).toBe('{"hello":"world"}');
    expect(response.headers.get("content-type")).toBe("application/json");
  });
});

describe("filterResponseHeaders", () => {
  test("returns undefined for undefined input", () => {
    expect(filterResponseHeaders()).toBeUndefined();
  });

  test("returns undefined when no allowlisted headers present", () => {
    expect(filterResponseHeaders({ "content-type": "application/json" })).toBeUndefined();
  });

  test("filters to only allowlisted headers", () => {
    const upstream = {
      "retry-after": "2",
      "retry-after-ms": "500",
      "x-should-retry": "true",
      "content-type": "application/json",
      "x-request-id": "req_123",
    };
    expect(filterResponseHeaders(upstream)).toEqual({
      "retry-after": "2",
      "retry-after-ms": "500",
      "x-should-retry": "true",
    });
  });

  test("returns only present allowlisted headers", () => {
    expect(filterResponseHeaders({ "retry-after": "1" })).toEqual({ "retry-after": "1" });
  });
});

describe("buildRetryHeaders", () => {
  test("returns x-should-retry false for non-retryable status without upstream", () => {
    expect(buildRetryHeaders(400)).toEqual({ "x-should-retry": "false" });
  });

  test("returns x-should-retry false for 422", () => {
    expect(buildRetryHeaders(422)).toEqual({ "x-should-retry": "false" });
  });

  test("preserves upstream x-should-retry for non-retryable status", () => {
    const upstream = { "x-should-retry": "true" };
    expect(buildRetryHeaders(400, upstream)).toEqual({ "x-should-retry": "true" });
  });

  test("generates fallback for 429 without upstream hints", () => {
    expect(buildRetryHeaders(429)).toEqual({ "retry-after-ms": "1000", "x-should-retry": "true" });
  });

  test("generates fallback for 503 without upstream hints", () => {
    expect(buildRetryHeaders(503)).toEqual({ "retry-after-ms": "1000", "x-should-retry": "true" });
  });

  test("generates fallback for 502 without upstream hints", () => {
    expect(buildRetryHeaders(502)).toEqual({ "retry-after-ms": "1000", "x-should-retry": "true" });
  });

  test("generates fallback for 408 without upstream hints", () => {
    expect(buildRetryHeaders(408)).toEqual({ "retry-after-ms": "1000", "x-should-retry": "true" });
  });

  test("generates fallback for 409 without upstream hints", () => {
    expect(buildRetryHeaders(409)).toEqual({ "retry-after-ms": "1000", "x-should-retry": "true" });
  });

  test("forwards upstream retry-after and adds x-should-retry for retryable status", () => {
    const upstream = { "retry-after": "5" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after": "5",
      "x-should-retry": "true",
    });
  });

  test("forwards upstream retry-after-ms and adds x-should-retry for retryable status", () => {
    const upstream = { "retry-after-ms": "2000" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after-ms": "2000",
      "x-should-retry": "true",
    });
  });

  test("forwards all upstream headers when complete for retryable status", () => {
    const upstream = { "retry-after": "5", "retry-after-ms": "5000", "x-should-retry": "true" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after": "5",
      "retry-after-ms": "5000",
      "x-should-retry": "true",
    });
  });

  test("respects upstream x-should-retry false for retryable status", () => {
    const upstream = { "retry-after": "5", "x-should-retry": "false" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after": "5",
      "x-should-retry": "false",
    });
  });

  test("filters out non-allowlisted headers from upstream", () => {
    const upstream = {
      "retry-after-ms": "500",
      "x-should-retry": "true",
      "x-request-id": "req_123",
    };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after-ms": "500",
      "x-should-retry": "true",
    });
  });
});

describe("prepareResponseInit", () => {
  test("returns x-request-id header without upstream", () => {
    expect(prepareResponseInit("req_1")).toEqual({
      headers: { "x-request-id": "req_1" },
    });
  });

  test("merges filtered upstream headers with x-request-id", () => {
    const upstream: ResponseInit = {
      headers: {
        "retry-after": "5",
        "x-should-retry": "true",
        "content-type": "application/json",
      },
    };
    expect(prepareResponseInit("req_2", upstream)).toEqual({
      headers: {
        "retry-after": "5",
        "x-should-retry": "true",
        "x-request-id": "req_2",
      },
    });
  });

  test("ignores upstream with no allowlisted headers", () => {
    const upstream: ResponseInit = {
      headers: { "content-type": "application/json" },
    };
    expect(prepareResponseInit("req_3", upstream)).toEqual({
      headers: { "x-request-id": "req_3" },
    });
  });

  test("handles empty upstream", () => {
    expect(prepareResponseInit("req_4", {})).toEqual({
      headers: { "x-request-id": "req_4" },
    });
  });
});
