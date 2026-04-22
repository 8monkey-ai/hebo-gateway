import type { MoonshotAILanguageModelOptions } from "@ai-sdk/moonshotai";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const MOONSHOT_DEFAULT_MAX_OUTPUT_TOKENS = 16384;

export const moonshotReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["moonshotai"] ??=
      {}) as MoonshotAILanguageModelOptions;

    if (reasoning.enabled === false) {
      target.thinking = { type: "disabled" };
    } else {
      target.thinking = {
        type: "enabled",
        budgetTokens:
          reasoning.max_tokens ??
          calculateReasoningBudgetFromEffort(
            reasoning.effort ?? "medium",
            params.maxOutputTokens ?? MOONSHOT_DEFAULT_MAX_OUTPUT_TOKENS,
            1024,
          ),
      };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("moonshot/*", {
  language: [moonshotReasoningMiddleware],
});
