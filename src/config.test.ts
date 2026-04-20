import { describe, expect, test } from "bun:test";

import { MockProviderV3 } from "ai/test";

import { parseConfig } from "./config";
import type { GatewayConfig } from "./types";
import { FORWARD_HEADER_ALLOWLIST } from "./utils/request";

const minimalConfig: GatewayConfig = {
  providers: { mock: new MockProviderV3() },
  models: {
    "mock/model": {
      name: "Mock",
      providers: ["mock"],
      modalities: { input: ["text"], output: ["text"] },
    },
  },
};

describe("parseConfig", () => {
  test("uses built-in allowlist when forwardHeaders is omitted", () => {
    const parsed = parseConfig({ ...minimalConfig });
    expect(parsed.forwardHeaders).toEqual([...FORWARD_HEADER_ALLOWLIST]);
  });

  test("uses built-in allowlist when forwardHeaders is empty", () => {
    const parsed = parseConfig({ ...minimalConfig, forwardHeaders: [] });
    expect(parsed.forwardHeaders).toEqual([...FORWARD_HEADER_ALLOWLIST]);
  });

  test("merges custom headers with built-in allowlist", () => {
    const parsed = parseConfig({
      ...minimalConfig,
      forwardHeaders: ["X-My-Custom-Header", "x-internal-team"],
    });

    expect(parsed.forwardHeaders).toContain("openai-beta");
    expect(parsed.forwardHeaders).toContain("x-my-custom-header");
    expect(parsed.forwardHeaders).toContain("x-internal-team");
    expect(parsed.forwardHeaders.length).toBe(FORWARD_HEADER_ALLOWLIST.length + 2);
  });

  test("lowercases custom forward headers", () => {
    const parsed = parseConfig({
      ...minimalConfig,
      forwardHeaders: ["X-UPPER-CASE"],
    });
    expect(parsed.forwardHeaders).toContain("x-upper-case");
  });
});
