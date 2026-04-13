import type { BedrockProviderOptions } from "@ai-sdk/amazon-bedrock";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsCacheControl,
  ChatCompletionsReasoningEffort,
  ChatCompletionsServiceTier,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const isClaude46 = (modelId: string) => modelId.includes("-4-6");

// https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
export const bedrockServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const bedrock = params.providerOptions?.["bedrock"] as BedrockProviderOptions;
    if (!bedrock || typeof bedrock !== "object") return params;

    const tier = bedrock.serviceTier as ChatCompletionsServiceTier | undefined;
    switch (tier) {
      case undefined:
        return params;
      case "auto":
        // Bedrock uses its default tier when omitted.
        delete bedrock.serviceTier;
        return params;
      case "scale":
        bedrock.serviceTier = "reserved";
        return params;
      case "default":
      case "flex":
      case "priority":
        bedrock.serviceTier = tier;
        return params;
    }

    return params;
  },
};

export const bedrockGptReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("gpt")) return params;

    const bedrock = params.providerOptions?.["bedrock"] as OpenAIChatLanguageModelOptions;
    if (!bedrock) return params;

    const effort = bedrock.reasoningEffort;
    if (effort === undefined) return params;

    const target = ((bedrock as BedrockProviderOptions).reasoningConfig ??= {});

    // @ts-expect-error AI SDK does accept this
    target.maxReasoningEffort = effort;

    delete bedrock.reasoningEffort;

    return params;
  },
};

export const bedrockClaudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("claude")) return params;

    const bedrock = params.providerOptions?.["bedrock"] as AnthropicLanguageModelOptions;
    if (!bedrock) return params;

    const thinking = bedrock.thinking;
    const effort = bedrock.effort;

    if (!thinking && effort === undefined) return params;

    const target = ((bedrock as BedrockProviderOptions).reasoningConfig ??= {});

    if (thinking && typeof thinking === "object") {
      // Bedrock's InvokeModel (Messages) API supports "adaptive" thinking natively,
      // but @ai-sdk/amazon-bedrock only uses the Converse API which rejects "adaptive"
      // in additionalModelRequestFields — it only accepts "enabled" / "disabled".
      // Map "adaptive" → "enabled" until the SDK adds InvokeModel support.
      // See: https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html
      // SDK tracking issue: https://github.com/vercel/ai/issues/8513
      target.type = thinking.type === "adaptive" ? "enabled" : thinking.type;
      if ("budgetTokens" in thinking && thinking.budgetTokens !== undefined) {
        target.budgetTokens = thinking.budgetTokens;
      } else if (target.type === "enabled") {
        // Bedrock requires budgetTokens when type is "enabled". When mapping from
        // "adaptive" (which doesn't require budgetTokens), compute a fallback using
        // the same effort-based logic as other model cases, defaulting to "medium".
        // Note: Bedrock Converse API doesn't support "adaptive" natively — see vercel/ai#8513
        const mappedEffort: ChatCompletionsReasoningEffort =
          effort === "max" ? "xhigh" : (effort as ChatCompletionsReasoningEffort) ?? "medium";
        target.budgetTokens = calculateReasoningBudgetFromEffort(
          mappedEffort,
          params.maxOutputTokens ?? 65536,
          1024,
        );
      }
    }

    // FUTURE: bedrock currently does not support "effort" for other 4.x models
    if (effort !== undefined && isClaude46(model.modelId)) {
      target.maxReasoningEffort = effort;
    }

    delete bedrock.thinking;
    delete bedrock.effort;

    return params;
  },
};

function toBedrockCachePoint(modelId: string, cacheControl?: ChatCompletionsCacheControl) {
  const out: { type: "default"; ttl?: string } = { type: "default" };
  // Nova currently only supports 5m
  if (cacheControl?.ttl && !modelId.includes("nova")) {
    out.ttl = cacheControl.ttl;
  }
  return out;
}

// https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
export const bedrockPromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("nova") && !model.modelId.includes("claude")) return params;

    let hasExplicitCacheControl = false;
    let lastCacheableBlock;

    const processCacheControl = (providerOptions?: SharedV3ProviderOptions) => {
      if (!providerOptions) return;

      const entryBedrock = providerOptions["bedrock"];
      const entryCacheControl = entryBedrock?.["cacheControl"] as ChatCompletionsCacheControl;
      if (!entryBedrock || !entryCacheControl) return;

      hasExplicitCacheControl = true;
      entryBedrock["cachePoint"] = toBedrockCachePoint(model.modelId, entryCacheControl);
      delete entryBedrock["cacheControl"];
    };

    for (const message of params.prompt) {
      processCacheControl(message.providerOptions);

      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        processCacheControl(part.providerOptions);
      }
      lastCacheableBlock = message;
    }

    const bedrock = params.providerOptions?.["bedrock"];
    const cacheControl = bedrock?.["cacheControl"] as ChatCompletionsCacheControl;
    if (cacheControl && !hasExplicitCacheControl && lastCacheableBlock) {
      ((lastCacheableBlock.providerOptions ??= {})["bedrock"] ??= {})["cachePoint"] =
        toBedrockCachePoint(model.modelId, cacheControl);
    }

    delete bedrock?.["cacheControl"];

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  language: [
    bedrockServiceTierMiddleware,
    bedrockGptReasoningMiddleware,
    bedrockClaudeReasoningMiddleware,
    bedrockPromptCachingMiddleware,
  ],
});
