import { describe, expect, test } from "bun:test";

import { prepareResponseInit, toResponse } from "./response";

describe("toResponse", () => {
  test("serializes JSON objects", async () => {
    const response = toResponse({ hello: "world" });

    expect(await response.text()).toBe('{"hello":"world"}');
    expect(response.headers.get("content-type")).toBe("application/json");
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

  test("accepts Headers instance as upstream headers", () => {
    const upstream: ResponseInit = {
      headers: new Headers({ "retry-after-ms": "1500" }),
    };
    expect(prepareResponseInit("req_5", upstream)).toEqual({
      headers: { "retry-after-ms": "1500", "x-request-id": "req_5" },
    });
  });

  test("x-request-id argument takes precedence over upstream", () => {
    const upstream: ResponseInit = {
      headers: { "x-request-id": "from_upstream" },
    };
    expect(prepareResponseInit("req_6", upstream)).toEqual({
      headers: { "x-request-id": "req_6" },
    });
  });
});
