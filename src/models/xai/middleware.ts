import type { XaiLanguageModelChatOptions } from "@ai-sdk/xai";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

export const xaiReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["xai"] ??= {}) as XaiLanguageModelChatOptions;

    if (reasoning.enabled === false) {
      target.reasoningEffort = undefined;
    } else if (reasoning.effort) {
      switch (reasoning.effort) {
        case "none":
          target.reasoningEffort = undefined;
          break;
        case "minimal":
        case "low":
          target.reasoningEffort = "low";
          break;
        case "medium":
        case "high":
        case "xhigh":
        case "max":
          target.reasoningEffort = "high";
          break;
      }
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel(
  ["xai/grok-4.1-fast-reasoning", "xai/grok-4.2-reasoning", "xai/grok-4.2-multi-agent"],
  { language: [xaiReasoningMiddleware] },
);
