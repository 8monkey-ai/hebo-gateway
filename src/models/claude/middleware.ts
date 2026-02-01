import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

/**
 * Anthropic Reasoning Transformation
 */
export const claudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    const reasoning = unknown?.["reasoning"] as ChatCompletionsReasoningConfig | undefined;
    if (!reasoning) return params;

    const target = (params.providerOptions!["anthropic"] ??= {});
    const { enabled, effort, max_tokens: reasoningMaxTokens } = reasoning;

    if (enabled === false) {
      target["thinking"] = { type: "disabled" };
    } else if (reasoningMaxTokens) {
      target["thinking"] = { type: "enabled", budgetTokens: reasoningMaxTokens };
    } else if (effort) {
      // default max tokens based on https://platform.claude.com/docs/en/about-claude/models/overview
      const maxCompletionTokens = params.maxOutputTokens ?? 64000;

      const budget = calculateBudgetFromEffort(effort, maxCompletionTokens);
      if (budget > 0) {
        target["thinking"] = { type: "enabled", budgetTokens: budget };
      }
    } else {
      target["thinking"] = { type: "enabled", budgetTokens: 1024 };
    }

    if (unknown) {
      delete unknown["reasoning"];
    }
    return params;
  },
};

function calculateBudgetFromEffort(effort: string, maxTokens: number): number {
  let percentage = 0;
  // recommended mapping from https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-compat/advanced#reasoning-parameters
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

modelMiddlewareMatcher.useForModel(["anthropic/claude-*3*7*", "anthropic/claude-*4*"], {
  language: claudeReasoningMiddleware,
});
