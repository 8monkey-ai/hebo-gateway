import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsCacheControl } from "../../endpoints/chat-completions/schema.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import { specOf } from "../../providers/registry.ts";
import type { ReasoningControls } from "../types.ts";

// Current generation, assumed for models without reasoning data (e.g. custom ones).
const CLAUDE: ReasoningControls = { effort: ["low", "medium", "high", "xhigh", "max"] };

// Effort levels and budget support come from the model spec (models.dev). Claude can always
// turn thinking off, and thinks adaptively unless given a budget it takes.
// Documentation:
// https://platform.claude.com/docs/en/build-with-claude/effort
// https://platform.claude.com/docs/en/build-with-claude/extended-thinking
// https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
export const claudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const spec = specOf(model);
    const controls = reasoningControls(spec, CLAUDE);
    const reasoning = takeReasoning(params);
    if (!reasoning || !controls) return params;

    const target = (params.providerOptions!["anthropic"] ??= {}) as AnthropicProviderOptions;

    if (reasoning.enabled === false || reasoning.effort === "none") {
      target.thinking = { type: "disabled" };
      return params;
    }

    const resolved = resolveReasoning(reasoning, controls, params.maxOutputTokens ?? spec.output)!;
    if (resolved.effort) target.effort = resolved.effort as AnthropicProviderOptions["effort"];
    target.thinking =
      reasoning.max_tokens && resolved.budget !== undefined
        ? { type: "enabled", budgetTokens: resolved.budget }
        : { type: "adaptive" };

    // Map reasoning.summary to Anthropic thinking.display
    const display =
      reasoning.summary === "none" ? "omitted" : reasoning.summary ? "summarized" : undefined;
    if (display) (target.thinking as Record<string, unknown>)["display"] = display;

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

    const cacheControl = unknown["cache_control"] as ChatCompletionsCacheControl | undefined;
    if (cacheControl) {
      ((params.providerOptions!["anthropic"] ??= {}) as AnthropicProviderOptions).cacheControl =
        // Claude TTLs are `5m` and `1h`. The gateway also accepts OpenAI's 24h retention
        // (`prompt_cache_retention`), which would fail the provider-options schema.
        cacheControl.ttl === "24h"
          ? { type: cacheControl.type, ttl: "1h" }
          : (cacheControl as AnthropicProviderOptions["cacheControl"]);
    }

    delete unknown["cache_control"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("anthropic/claude-*", {
  language: [claudeReasoningMiddleware, claudePromptCachingMiddleware],
});
