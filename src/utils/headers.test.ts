import { describe, expect, test } from "bun:test";

import { buildRetryHeaders, filterResponseHeaders } from "./headers";

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

  test("generates fallback retry-after and retry-after-ms for 429 without upstream hints", () => {
    expect(buildRetryHeaders(429)).toEqual({
      "retry-after": "1",
      "retry-after-ms": "1000",
      "x-should-retry": "true",
    });
  });

  test("generates fallback for 503 without upstream hints", () => {
    expect(buildRetryHeaders(503)).toEqual({
      "retry-after": "1",
      "retry-after-ms": "1000",
      "x-should-retry": "true",
    });
  });

  test("generates fallback for 502 without upstream hints", () => {
    expect(buildRetryHeaders(502)).toEqual({
      "retry-after": "1",
      "retry-after-ms": "1000",
      "x-should-retry": "true",
    });
  });

  test("generates fallback for 408 without upstream hints", () => {
    expect(buildRetryHeaders(408)).toEqual({
      "retry-after": "1",
      "retry-after-ms": "1000",
      "x-should-retry": "true",
    });
  });

  test("generates fallback for 409 without upstream hints", () => {
    expect(buildRetryHeaders(409)).toEqual({
      "retry-after": "1",
      "retry-after-ms": "1000",
      "x-should-retry": "true",
    });
  });

  test("forwards upstream retry-after and derives retry-after-ms for retryable status", () => {
    const upstream = { "retry-after": "5" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after": "5",
      "retry-after-ms": "5000",
      "x-should-retry": "true",
    });
  });

  test("forwards upstream retry-after-ms and derives retry-after for retryable status", () => {
    const upstream = { "retry-after-ms": "2000" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after": "2",
      "retry-after-ms": "2000",
      "x-should-retry": "true",
    });
  });

  test("rounds retry-after up to nearest second", () => {
    const upstream = { "retry-after-ms": "1500" };
    expect(buildRetryHeaders(429, upstream)).toEqual({
      "retry-after": "2",
      "retry-after-ms": "1500",
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
      "retry-after-ms": "5000",
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
      "retry-after": "1",
      "retry-after-ms": "500",
      "x-should-retry": "true",
    });
  });

  test("derives retry-after-ms from retry-after for non-retryable status", () => {
    const upstream = { "retry-after": "3", "x-should-retry": "true" };
    expect(buildRetryHeaders(400, upstream)).toEqual({
      "retry-after": "3",
      "retry-after-ms": "3000",
      "x-should-retry": "true",
    });
  });

  test("derives retry-after from retry-after-ms for non-retryable status", () => {
    const upstream = { "retry-after-ms": "2500", "x-should-retry": "true" };
    expect(buildRetryHeaders(400, upstream)).toEqual({
      "retry-after": "3",
      "retry-after-ms": "2500",
      "x-should-retry": "true",
    });
  });
});
