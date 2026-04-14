import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const isClaude = (family: "opus" | "sonnet" | "haiku", version: string) => {
  const dashed = version.replace(".", "-");

  return (modelId: string) =>
    modelId.includes(`claude-${family}-${version}`) ||
    modelId.includes(`claude-${family}-${dashed}`);
};

const isClaude4 = (modelId: string) => modelId.includes("claude-") && modelId.includes("-4");

const isOpus46 = isClaude("opus", "4.6");
const isOpus45 = isClaude("opus", "4.5");
const isOpus4 = isClaude("opus", "4");
const isSonnet46 = isClaude("sonnet", "4.6");

export function mapClaudeReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
  modelId: string,
): "low" | "medium" | "high" | "max" | undefined {
  if (isOpus46(modelId)) {
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
        return "max";
    }
  }

  switch (effort) {
    case "none":
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
      return "high";
  }

  return undefined;
}

function getMaxOutputTokens(modelId: string): number {
  if (isOpus46(modelId)) return 128_000;
  if (isOpus45(modelId)) return 64_000;
  if (isOpus4(modelId)) return 32_000;
  return 64_000;
}

// Documentation:
// https://platform.claude.com/docs/en/build-with-claude/effort
// https://platform.claude.com/docs/en/build-with-claude/extended-thinking
// https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
export const claudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["anthropic"] ??= {}) as AnthropicProviderOptions;
    const modelId = model.modelId;
    const clampedMaxTokens =
      reasoning.max_tokens && Math.min(reasoning.max_tokens, getMaxOutputTokens(modelId));

    // Map reasoning.summary to Anthropic thinking.display
    const summary = reasoning.summary as string | undefined;
    const thinkingDisplay = summary === "none" ? "omitted" : summary ? "summarized" : undefined;

    if (!reasoning.enabled) {
      target.thinking = { type: "disabled" };
    } else if (reasoning.effort) {
      if (isClaude4(modelId)) {
        target.effort = mapClaudeReasoningEffort(reasoning.effort, modelId);
      }
      if (isOpus46(modelId)) {
        target.thinking = clampedMaxTokens
          ? // @ts-expect-error AI SDK type missing type:adaptive with budgetToken
            { type: "adaptive", budgetTokens: clampedMaxTokens }
          : { type: "adaptive" };
      } else if (isSonnet46(modelId)) {
        target.thinking = clampedMaxTokens
          ? { type: "enabled", budgetTokens: clampedMaxTokens }
          : { type: "adaptive" };
      } else {
        target.thinking = { type: "enabled" };
        if (clampedMaxTokens) {
          target.thinking.budgetTokens = clampedMaxTokens;
        } else {
          // FUTURE: warn that reasoning.max_tokens was computed
          target.thinking.budgetTokens = calculateReasoningBudgetFromEffort(
            reasoning.effort,
            params.maxOutputTokens ?? getMaxOutputTokens(modelId),
            1024,
          );
        }
      }
    } else if (clampedMaxTokens) {
      target.thinking = {
        type: "enabled",
        budgetTokens: clampedMaxTokens,
      };
    } else {
      target.thinking = { type: "enabled" };
    }

    // Apply display preference to the resolved thinking config
    if (thinkingDisplay && target.thinking && target.thinking.type !== "disabled") {
      (target.thinking as Record<string, unknown>)["display"] = thinkingDisplay;
    }

    delete unknown["reasoning"];

    return params;
  },
};

// https://platform.claude.com/docs/en/build-with-claude/prompt-caching
export const claudePromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const cacheControl = unknown["cache_control"] as AnthropicProviderOptions["cacheControl"];
    if (cacheControl) {
      ((params.providerOptions!["anthropic"] ??= {}) as AnthropicProviderOptions).cacheControl =
        cacheControl;
    }

    delete unknown["cache_control"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel(["anthropic/claude-*3*7*", "anthropic/claude-*4*"], {
  language: [claudeReasoningMiddleware, claudePromptCachingMiddleware],
});
