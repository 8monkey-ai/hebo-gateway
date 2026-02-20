import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

function isClaudeOpus46Model(modelId: string): boolean {
  return modelId.includes("claude-opus-4.6");
}

function isClaudeSonnet46Model(modelId: string): boolean {
  return modelId.includes("claude-sonnet-4.6");
}

function isClaudeSonnet45Model(modelId: string): boolean {
  return modelId.includes("claude-sonnet-4.5");
}

export function mapClaudeReasoningEffort(effort: ChatCompletionsReasoningEffort, modelId: string) {
  if (isClaudeOpus46Model(modelId)) {
    switch (effort) {
      case "none":
      case "minimal":
      case "low":
        return "low";
      case "medium":
        return "medium";
      case "high":
        return "high";
      case "xhigh":
      case "max":
        return "max";
    }
  }

  if (isClaudeSonnet46Model(modelId) || isClaudeSonnet45Model(modelId)) {
    switch (effort) {
      case "none":
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
  }
}

function getMaxOutputTokens(modelId: string): number {
  if (modelId.includes("opus-4.6")) return 128_000;
  if (modelId.includes("opus-4.5")) return 64_000;
  if (modelId.includes("opus-4")) return 32_000;
  return 64_000;
}

// https://platform.claude.com/docs/en/build-with-claude/effort
export const claudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["anthropic"] ??= {});
    const modelId = model.modelId;
    const clampedMaxTokens =
      reasoning.max_tokens && Math.min(reasoning.max_tokens, getMaxOutputTokens(modelId));

    if (!reasoning.enabled) {
      target["thinking"] = { type: "disabled" };
    } else if (reasoning.effort) {
      const effort = mapClaudeReasoningEffort(reasoning.effort, modelId);

      if (isClaudeOpus46Model(modelId)) {
        target["thinking"] = clampedMaxTokens
          ? { type: "adaptive", budgetTokens: clampedMaxTokens }
          : { type: "adaptive" };
        target["effort"] = effort;
      } else if (isClaudeSonnet46Model(modelId)) {
        target["thinking"] = clampedMaxTokens
          ? { type: "enabled", budgetTokens: clampedMaxTokens }
          : { type: "adaptive" };
        target["effort"] = effort;
      } else if (isClaudeSonnet45Model(modelId)) {
        target["thinking"] = { type: "enabled" };
        if (clampedMaxTokens) target["thinking"]["budgetTokens"] = clampedMaxTokens;
        target["effort"] = effort;
      } else {
        // FUTURE: warn that reasoning.max_tokens was computed
        target["thinking"] = {
          type: "enabled",
          budgetTokens: calculateReasoningBudgetFromEffort(
            reasoning.effort,
            params.maxOutputTokens ?? getMaxOutputTokens(modelId),
            1024,
          ),
        };
      }
    } else if (clampedMaxTokens) {
      target["thinking"] = {
        type: "enabled",
        budgetTokens: clampedMaxTokens,
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
