import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

function mapMinimaxReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
): "low" | "medium" | "high" | undefined {
  switch (effort) {
    case "none":
      return undefined;
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
    case "max":
      return "high";
  }

  return undefined;
}

// MiniMax M2.7 supports reasoning via OpenAI-compatible reasoning_effort.
// Map the gateway's generic reasoning config to the provider-native parameter.
export const minimaxReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    if (reasoning.enabled === false) {
      unknown["reasoning_effort"] = "none";
    } else if (reasoning.effort) {
      unknown["reasoning_effort"] = mapMinimaxReasoningEffort(reasoning.effort);
    }

    // max_tokens not supported by MiniMax reasoning

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("minimax/*", {
  language: [minimaxReasoningMiddleware],
});
