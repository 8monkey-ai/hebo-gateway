import type { AlibabaLanguageModelOptions } from "@ai-sdk/alibaba";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const QWEN_DEFAULT_MAX_OUTPUT_TOKENS = 16384;

export const qwenReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["alibaba"] ??= {}) as AlibabaLanguageModelOptions;

    if (!reasoning.enabled || reasoning.effort === "none") {
      target.enableThinking = false;
      target.thinkingBudget = undefined;
    } else {
      target.enableThinking = true;
      target.thinkingBudget =
        reasoning.max_tokens ??
        calculateReasoningBudgetFromEffort(
          reasoning.effort ?? "medium",
          params.maxOutputTokens ?? QWEN_DEFAULT_MAX_OUTPUT_TOKENS,
        );
    }

    unknown["reasoning"] = undefined;

    return params;
  },
};

modelMiddlewareMatcher.useForModel("alibaba/qwen*", {
  language: [qwenReasoningMiddleware],
});
