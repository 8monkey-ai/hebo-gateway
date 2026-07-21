import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsServiceTier,
} from "../../endpoints/chat-completions";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

const VERTEX_REQUEST_TYPE_HEADER = "x-vertex-ai-llm-request-type";
const VERTEX_SHARED_REQUEST_TYPE_HEADER = "x-vertex-ai-llm-shared-request-type";

function setHeaderIfMissing(
  headers: Record<string, string | undefined>,
  key: string,
  value: string,
) {
  headers[key] ??= value;
}

// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/standard-paygo
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/priority-paygo
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/flex-paygo
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/use-provisioned-throughput
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerateContentResponse#TrafficType
export const vertexServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const vertex = params.providerOptions?.["vertex"];
    if (!vertex || typeof vertex !== "object") return params;

    const tier = vertex["serviceTier"] as ChatCompletionsServiceTier | undefined;
    const headers = (params.headers ??= {});

    switch (tier) {
      case undefined:
        return params;
      case "flex":
        setHeaderIfMissing(headers, VERTEX_REQUEST_TYPE_HEADER, "shared");
        setHeaderIfMissing(headers, VERTEX_SHARED_REQUEST_TYPE_HEADER, "flex");
        break;
      case "priority":
        setHeaderIfMissing(headers, VERTEX_REQUEST_TYPE_HEADER, "shared");
        setHeaderIfMissing(headers, VERTEX_SHARED_REQUEST_TYPE_HEADER, "priority");
        break;
      case "scale":
        setHeaderIfMissing(headers, VERTEX_REQUEST_TYPE_HEADER, "dedicated");
        break;
      case "default":
        setHeaderIfMissing(headers, VERTEX_REQUEST_TYPE_HEADER, "shared");
        break;
      case "auto":
        break;
    }

    delete vertex["serviceTier"];
    return params;
  },
};

modelMiddlewareMatcher.useForProvider(["google.vertex.*"], {
  language: [vertexServiceTierMiddleware],
});

// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/maas/capabilities/thinking
// Gemma thinking on the MaaS OpenAI-compatible endpoint is binary:
// any effort enables it, `none` / `enabled: false` disables it.
// Gemma-only: other MaaS models control thinking differently
// (gpt-oss uses reasoning_effort; the *-thinking variants are always on).
export const vertexGemmaThinkingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("gemma")) return params;

    const vertex = params.providerOptions?.["vertex"];
    if (!vertex || typeof vertex !== "object") return params;

    const reasoning = vertex["reasoning"] as ChatCompletionsReasoningConfig | undefined;
    if (!reasoning) return params;

    // Normalization drops `enabled: true` when no effort/budget is set,
    // so treat any reasoning object without an explicit disable as enabled.
    vertex["chat_template_kwargs"] = { enable_thinking: reasoning.enabled !== false };
    delete vertex["reasoning"];
    delete vertex["reasoningEffort"];

    return params;
  },
};

modelMiddlewareMatcher.useForProvider(["vertex.maas.*"], {
  language: [vertexGemmaThinkingMiddleware],
});
