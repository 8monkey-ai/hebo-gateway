import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const CLAUDE_MAX_OUTPUT_TOKENS = 64000;
const CLAUDE_OPUS_4_MAX_OUTPUT_TOKENS = 32000;

function getMaxOutputTokens(modelId: string): number {
  if (!modelId.includes("opus-4")) return CLAUDE_MAX_OUTPUT_TOKENS;
  if (modelId.includes("opus-4.5") || modelId.includes("opus-4-5")) {
    return CLAUDE_MAX_OUTPUT_TOKENS;
  }
  return CLAUDE_OPUS_4_MAX_OUTPUT_TOKENS;
}

export const claudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["anthropic"] ??= {});

    if (!reasoning.enabled) {
      target["thinking"] = { type: "disabled" };
    } else if (reasoning.max_tokens) {
      target["thinking"] = {
        type: "enabled",
        budgetTokens: Math.min(reasoning.max_tokens, getMaxOutputTokens(model.modelId)),
      };
    } else if (reasoning.effort) {
      // FUTURE: warn that reasoning.max_tokens was computed
      target["thinking"] = {
        type: "enabled",
        budgetTokens: calculateReasoningBudgetFromEffort(
          reasoning.effort,
          params.maxOutputTokens ?? getMaxOutputTokens(model.modelId),
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
  language: [claudeReasoningMiddleware],
});
