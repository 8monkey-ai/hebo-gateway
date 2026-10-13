import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek";
import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// DeepSeek V4 knows three thinking strengths; `medium` has no level of its own.
// https://api-docs.deepseek.com/guides/reasoning_model
function mapDeepseekReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
): DeepSeekLanguageModelOptions["reasoningEffort"] {
  switch (effort) {
    case "none":
      return undefined;
    case "minimal":
    case "low":
    case "medium":
      return "low";
    case "high":
    case "xhigh":
      return "high";
    case "max":
      return "max";
  }

  return undefined;
}

export const deepseekReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["deepseek"] ??= {}) as DeepSeekLanguageModelOptions;

    if (reasoning.enabled === false || reasoning.effort === "none") {
      target.thinking = { type: "disabled" };
    } else if (reasoning.enabled) {
      target.thinking = { type: "enabled" };
    }

    if (reasoning.effort && reasoning.effort !== "none") {
      target.reasoningEffort = mapDeepseekReasoningEffort(reasoning.effort);
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel(["deepseek/deepseek-v4-pro", "deepseek/deepseek-v4.1-flash"], {
  language: [deepseekReasoningMiddleware],
});
