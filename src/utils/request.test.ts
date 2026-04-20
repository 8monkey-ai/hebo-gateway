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

  test("forwards agent attribution headers", () => {
    const request = new Request("https://example.com", {
      headers: {
        // Agent session / run correlation
        "agent-session-id": "sess_abc123",
        "x-claude-code-session-id": "cc_sess_456",
        "x-kilocode-taskid": "task_789",
        // Agent identification
        "http-referer": "https://cline.bot",
        "or_app_name": "OpenHands",
        "or_site_url": "https://openhands.ai",
        "x-kilocode-editorname": "vscode",
        "x-kilocode-feature": "chat",
        "x-openrouter-title": "Cline",
        // Agent organization / project context
        "x-kilocode-organizationid": "org_kilo_1",
        "x-kilocode-projectid": "proj_kilo_2",
        "x-kilocode-machineid": "machine_3",
        "x-kilocode-tester": "tester_4",
        // SDK / protocol identification
        "anthropic-version": "2023-06-01",
        "x-stainless-lang": "python",
        "x-stainless-package-version": "0.30.0",
        "x-stainless-os": "linux",
        "x-stainless-arch": "x86_64",
        "x-stainless-runtime": "cpython",
        "x-stainless-runtime-version": "3.12.0",
      },
    });

    const headers = prepareForwardHeaders(request);

    expect(headers["agent-session-id"]).toBe("sess_abc123");
    expect(headers["x-claude-code-session-id"]).toBe("cc_sess_456");
    expect(headers["x-kilocode-taskid"]).toBe("task_789");
    expect(headers["http-referer"]).toBe("https://cline.bot");
    expect(headers["or_app_name"]).toBe("OpenHands");
    expect(headers["or_site_url"]).toBe("https://openhands.ai");
    expect(headers["x-kilocode-editorname"]).toBe("vscode");
    expect(headers["x-kilocode-feature"]).toBe("chat");
    expect(headers["x-kilocode-organizationid"]).toBe("org_kilo_1");
    expect(headers["x-kilocode-projectid"]).toBe("proj_kilo_2");
    expect(headers["x-kilocode-machineid"]).toBe("machine_3");
    expect(headers["x-kilocode-tester"]).toBe("tester_4");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["x-stainless-lang"]).toBe("python");
    expect(headers["x-stainless-package-version"]).toBe("0.30.0");
    expect(headers["x-stainless-os"]).toBe("linux");
    expect(headers["x-stainless-arch"]).toBe("x86_64");
    expect(headers["x-stainless-runtime"]).toBe("cpython");
    expect(headers["x-stainless-runtime-version"]).toBe("3.12.0");
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
