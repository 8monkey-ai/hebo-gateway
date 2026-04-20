import pkg from "../../package.json" with { type: "json" };
import { resolveRequestId } from "./headers";

const GATEWAY_VERSION = pkg.version;

export const FORWARD_HEADER_ALLOWLIST = [
  // OpenAI + OpenAI-compatible providers (Azure, Groq, Together, Fireworks, etc.)
  "openai-beta",
  "openai-organization",
  "openai-project",
  // OpenRouter
  "http-referer",
  "or_app_name",
  "or_site_url",
  "x-openrouter-categories",
  "x-openrouter-title",
  "x-title",
  // Anthropic
  "anthropic-beta",
  "anthropic-version",
  // AWS Bedrock
  "x-amzn-bedrock-guardrailidentifier",
  "x-amzn-bedrock-guardrailversion",
  "x-amzn-bedrock-performanceconfig-latency",
  "x-amzn-bedrock-trace",
  // Cohere
  "x-client-name",
  // Vertex provisioned throughput / endpoint routing
  "x-vertex-ai-endpoint-id",
  "x-vertex-ai-llm-request-type",
  "x-vertex-ai-llm-shared-request-type",
  // Agent session / run correlation
  "agent-session-id",
  "x-claude-code-session-id",
  "x-kilo-session",
  "x-kilocode-taskid",
  "x-task-id",
  // Agent identification
  "x-client",
  "x-kilocode-editorname",
  "x-kilocode-feature",
  // Agent organization / project context
  "x-client-type",
  "x-client-version",
  "x-kilocode-machineid",
  "x-kilocode-organizationid",
  "x-kilocode-projectid",
  "x-kilocode-tester",
  "x-platform",
  "x-platform-version",
  // SDK / protocol identification
  "x-goog-api-client",
  "x-stainless-arch",
  "x-stainless-lang",
  "x-stainless-os",
  "x-stainless-package-version",
  "x-stainless-runtime",
  "x-stainless-runtime-version",
] as const;

const createRequestId = () =>
  "req_" + crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), "");

export const resolveOrCreateRequestId = (request: Request) =>
  resolveRequestId(request) ?? createRequestId();

export const prepareForwardHeaders = (
  request: Request,
  allowlist: readonly string[] = FORWARD_HEADER_ALLOWLIST,
): Record<string, string> => {
  const userAgent = request.headers.get("user-agent");
  const appendedUserAgent = userAgent
    ? `${userAgent} @hebo-ai/gateway/${GATEWAY_VERSION}`
    : `@hebo-ai/gateway/${GATEWAY_VERSION}`;

  const headers: Record<string, string> = {
    "user-agent": appendedUserAgent,
  };

  for (const key of allowlist) {
    const value = request.headers.get(key);
    if (value !== null) headers[key] = value;
  }

  return headers;
};
