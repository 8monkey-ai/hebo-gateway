import { describe, expect, test } from "bun:test";

import { toResponse } from "./response";

describe("toResponse", () => {
  test("serializes JSON objects", async () => {
    const response = toResponse({ hello: "world" });

    expect(await response.text()).toBe('{"hello":"world"}');
    expect(response.headers.get("content-type")).toBe("application/json");
  });
});
