import type { FireworksLanguageModelOptions } from "@ai-sdk/fireworks";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const FIREWORKS_MAX_OUTPUT_TOKENS = 131072;

export const fireworksReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const fireworks = params.providerOptions?.["fireworks"] as FireworksLanguageModelOptions;
    if (!fireworks || typeof fireworks !== "object") return params;

    const reasoning = fireworks["reasoning" as keyof typeof fireworks] as
      | ChatCompletionsReasoningConfig
      | undefined;
    if (!reasoning) return params;

    if (!reasoning.enabled) {
      fireworks.thinking = { type: "disabled" };
    } else if (reasoning.max_tokens) {
      fireworks.thinking = { type: "enabled", budgetTokens: reasoning.max_tokens };
    } else if (reasoning.effort) {
      fireworks.thinking = {
        type: "enabled",
        budgetTokens: calculateReasoningBudgetFromEffort(
          reasoning.effort,
          params.maxOutputTokens ?? FIREWORKS_MAX_OUTPUT_TOKENS,
          1024,
        ),
      };
    } else {
      fireworks.thinking = { type: "enabled" };
    }

    delete fireworks["reasoning" as keyof typeof fireworks];

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("fireworks", {
  language: [fireworksReasoningMiddleware],
});
