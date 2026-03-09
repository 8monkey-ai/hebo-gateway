import type { LanguageModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { ChatCompletionsServiceTier } from "../../endpoints/chat-completions";

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
