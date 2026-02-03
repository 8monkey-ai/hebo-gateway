import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const CLAUDE_MAX_OUTPUT_TOKENS = 64000;
export const claudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["anthropic"] ??= {});

    if (!reasoning.enabled) {
      target["thinking"] = { type: "disabled" };
    } else if (reasoning.max_tokens) {
      target["thinking"] = { type: "enabled", budgetTokens: reasoning.max_tokens };
    } else if (reasoning.effort) {
      // FUTURE: warn that reasoning.max_tokens was computed
      target["thinking"] = {
        type: "enabled",
        budgetTokens: calculateReasoningBudgetFromEffort(
          reasoning.effort,
          params.maxOutputTokens ?? CLAUDE_MAX_OUTPUT_TOKENS,
          1024,
        ),
      };
    } else {
      target["thinking"] = { type: "enabled" };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel(["anthropic/claude-*3*7*", "anthropic/claude-*4*"], {
  language: claudeReasoningMiddleware,
});
