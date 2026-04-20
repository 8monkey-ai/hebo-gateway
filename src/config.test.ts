import { describe, expect, mock, test } from "bun:test";

import { MockProviderV3 } from "ai/test";

import { parseConfig } from "./config";
import type { Logger } from "./logger";
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

const createMockLogger = (): Logger => ({
  trace: mock(() => {}),
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
});

describe("parseConfig", () => {
  test("uses built-in allowlist when forwardHeaders is omitted", () => {
    const parsed = parseConfig({ ...minimalConfig });
    expect(parsed.advanced.forwardHeaders).toEqual([...FORWARD_HEADER_ALLOWLIST]);
  });

  test("uses built-in allowlist when forwardHeaders is empty", () => {
    const parsed = parseConfig({ ...minimalConfig, advanced: { forwardHeaders: [] } });
    expect(parsed.advanced.forwardHeaders).toEqual([...FORWARD_HEADER_ALLOWLIST]);
  });

  test("merges custom headers with built-in allowlist", () => {
    const parsed = parseConfig({
      ...minimalConfig,
      advanced: { forwardHeaders: ["X-My-Custom-Header", "x-internal-team"] },
    });

    expect(parsed.advanced.forwardHeaders).toContain("openai-beta");
    expect(parsed.advanced.forwardHeaders).toContain("x-my-custom-header");
    expect(parsed.advanced.forwardHeaders).toContain("x-internal-team");
    expect(parsed.advanced.forwardHeaders.length).toBe(FORWARD_HEADER_ALLOWLIST.length + 2);
  });

  test("lowercases custom forward headers", () => {
    const parsed = parseConfig({
      ...minimalConfig,
      advanced: { forwardHeaders: ["X-UPPER-CASE"] },
    });
    expect(parsed.advanced.forwardHeaders).toContain("x-upper-case");
  });

  test("deduplicates custom headers that overlap with built-in allowlist", () => {
    const parsed = parseConfig({
      ...minimalConfig,
      advanced: { forwardHeaders: ["openai-beta", "OpenAI-Beta", "x-new-header"] },
    });
    const count = parsed.advanced.forwardHeaders.filter((h) => h === "openai-beta").length;
    expect(count).toBe(1);
    expect(parsed.advanced.forwardHeaders).toContain("x-new-header");
    expect(parsed.advanced.forwardHeaders.length).toBe(FORWARD_HEADER_ALLOWLIST.length + 1);
  });

  test("ignores invalid header names and logs a warning", () => {
    const logger = createMockLogger();

    const parsed = parseConfig({
      ...minimalConfig,
      logger,
      advanced: { forwardHeaders: ["x invalid header", "x-valid-header"] },
    });

    expect(parsed.advanced.forwardHeaders).toEqual([...FORWARD_HEADER_ALLOWLIST, "x-valid-header"]);
    expect(logger.warn).toHaveBeenCalledWith(
      `[config] invalid advanced.forwardHeaders entry ignored: ${JSON.stringify("x invalid header")}`,
    );
  });

  test("ignores empty header names and logs a warning", () => {
    const logger = createMockLogger();

    const parsed = parseConfig({
      ...minimalConfig,
      logger,
      advanced: { forwardHeaders: [""] },
    });

    expect(parsed.advanced.forwardHeaders).toEqual([...FORWARD_HEADER_ALLOWLIST]);
    expect(logger.warn).toHaveBeenCalledWith(
      `[config] invalid advanced.forwardHeaders entry ignored: ${JSON.stringify("")}`,
    );
  });
});
