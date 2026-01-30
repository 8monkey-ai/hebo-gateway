import type { LanguageModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

/**
 * Anthropic Reasoning Transformation
 */
export const anthropicReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    const reasoning = unhandled?.["reasoning"];
    if (!reasoning || typeof reasoning !== "object") return params;

    const target = (params.providerOptions!["anthropic"] ??= {});
    const { enabled, effort, max_tokens: reasoningMaxTokens } = reasoning;

    if (enabled === false) {
      target["thinking"] = { type: "disabled" };
    } else if (reasoningMaxTokens) {
      target["thinking"] = { type: "enabled", budgetTokens: reasoningMaxTokens };
    } else if (effort) {
      const maxCompletionTokens = params.maxOutputTokens ?? 4096;

      const budget = calculateBudgetFromEffort(effort, maxCompletionTokens);
      if (budget > 0) {
        target["thinking"] = { type: "enabled", budgetTokens: budget };
      }
    } else if (enabled !== false) {
      target["thinking"] = { type: "enabled", budgetTokens: 1024 };
    }

    delete unhandled["reasoning"];
    return params;
  },
};

function calculateBudgetFromEffort(effort: string, maxTokens: number): number {
  let percentage = 0;
  switch (effort) {
    case "none":
      return 0;
    case "minimal":
      percentage = 0.1;
      break;
    case "low":
      percentage = 0.2;
      break;
    case "medium":
      percentage = 0.5;
      break;
    case "high":
      percentage = 0.8;
      break;
    case "xhigh":
      percentage = 0.95;
      break;
    default:
      return 0;
  }

  // Anthropic requires at least 1024 tokens for thinking
  return Math.max(1024, Math.floor(maxTokens * percentage));
}

modelMiddlewareMatcher.useForModel("anthropic/claude-*sonnet*", {
  language: anthropicReasoningMiddleware,
});

modelMiddlewareMatcher.useForModel("anthropic/claude-*opus*", {
  language: anthropicReasoningMiddleware,
});
