import { describe, expect, test } from "bun:test";

import { prepareForwardHeaders } from "./request";

describe("prepareForwardHeaders", () => {
  test("always appends gateway user-agent suffix", () => {
    const request = new Request("https://example.com", {
      headers: { "user-agent": "client/1.0" },
    });

    const headers = prepareForwardHeaders(request);

    expect(headers["user-agent"]!.startsWith("client/1.0 @hebo-ai/gateway/")).toBe(true);
  });

  test("falls back to gateway user-agent when incoming user-agent is missing", () => {
    const request = new Request("https://example.com");

    const headers = prepareForwardHeaders(request);

    expect(headers["user-agent"]!.startsWith("@hebo-ai/gateway/")).toBe(true);
  });

  test("forwards allowlisted provider headers without provider context", () => {
    const request = new Request("https://example.com", {
      headers: {
        "openai-beta": "responses=v1",
        "openai-organization": "org_123",
        "openai-project": "proj_123",
        "anthropic-beta": "interleaved-thinking-2025-05-14",
        "x-amzn-bedrock-performanceconfig-latency": "optimized",
        "x-amzn-bedrock-trace": "ENABLED_FULL",
        "x-client-name": "hebo-gateway-test",
        "x-vertex-ai-endpoint-id": "projects/1/locations/us-central1/endpoints/123",
        "x-vertex-ai-llm-request-type": "dedicated",
        "x-vertex-ai-llm-shared-request-type": "provisioned-throughput",
        "x-title": "Gateway App",
        "x-unrelated-header": "blocked",
      },
    });

    const headers = prepareForwardHeaders(request);

    expect(headers["openai-beta"]).toBe("responses=v1");
    expect(headers["openai-organization"]).toBe("org_123");
    expect(headers["openai-project"]).toBe("proj_123");
    expect(headers["anthropic-beta"]).toBe("interleaved-thinking-2025-05-14");
    expect(headers["x-amzn-bedrock-performanceconfig-latency"]).toBe("optimized");
    expect(headers["x-amzn-bedrock-trace"]).toBe("ENABLED_FULL");
    expect(headers["x-client-name"]).toBe("hebo-gateway-test");
    expect(headers["x-vertex-ai-endpoint-id"]).toBe(
      "projects/1/locations/us-central1/endpoints/123",
    );
    expect(headers["x-vertex-ai-llm-request-type"]).toBe("dedicated");
    expect(headers["x-vertex-ai-llm-shared-request-type"]).toBe("provisioned-throughput");
    expect(headers["x-title"]).toBe("Gateway App");
    expect(headers["x-unrelated-header"]).toBeUndefined();
  });

  test("does not forward headers outside the allowlist", () => {
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer user-token",
        cookie: "session=abc",
        "x-custom-header": "blocked",
      },
    });

    const headers = prepareForwardHeaders(request);

    expect(headers["authorization"]).toBeUndefined();
    expect(headers["cookie"]).toBeUndefined();
    expect(headers["x-custom-header"]).toBeUndefined();
  });
});
