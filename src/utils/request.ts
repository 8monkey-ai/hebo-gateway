import pkg from "../../package.json" with { type: "json" };
import { resolveRequestId } from "./headers";

const GATEWAY_VERSION = pkg.version;

const FORWARD_HEADER_ALLOWLIST = [
  // OpenAI + OpenAI-compatible providers (Azure, Groq, Together, Fireworks, etc.)
  "openai-beta",
  "openai-organization",
  "openai-project",
  // OpenRouter
  "x-openrouter-categories",
  "x-openrouter-title",
  "x-title",
  // Anthropic
  "anthropic-beta",
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
] as const;

const createRequestId = () =>
  "req_" + crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), "");

export const resolveOrCreateRequestId = (request: Request) =>
  resolveRequestId(request) ?? createRequestId();

export const prepareForwardHeaders = (request: Request): Record<string, string> => {
  const userAgent = request.headers.get("user-agent");
  const appendedUserAgent = userAgent
    ? `${userAgent} @hebo-ai/gateway/${GATEWAY_VERSION}`
    : `@hebo-ai/gateway/${GATEWAY_VERSION}`;

  const headers: Record<string, string> = {
    "user-agent": appendedUserAgent,
  };

  for (const key of FORWARD_HEADER_ALLOWLIST) {
    const value = request.headers.get(key);
    if (value !== null) headers[key] = value;
  }

  return headers;
};
