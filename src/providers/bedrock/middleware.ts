import type { BedrockProviderOptions } from "@ai-sdk/amazon-bedrock";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type {
  OpenAIChatLanguageModelOptions,
  OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsCacheControl,
  ChatCompletionsReasoningEffort,
  ChatCompletionsServiceTier,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

const BEDROCK_EFFORT_CAPABLE = ["-4-6", "-4-7"] as const;
const isBedrockEffortCapable = (modelId: string) =>
  BEDROCK_EFFORT_CAPABLE.some((tag) => modelId.includes(tag));

// Bedrock serves the default tier when the tier is omitted, so `auto` maps to nothing.
// https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
const toBedrockServiceTier = (
  tier: ChatCompletionsServiceTier,
): BedrockProviderOptions["serviceTier"] => {
  switch (tier) {
    case "auto":
      return undefined;
    case "scale":
      return "reserved";
    case "default":
    case "flex":
    case "priority":
      return tier;
  }

  return undefined;
};

// Converse takes the tier in the request body.
export const bedrockServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const bedrock = params.providerOptions?.["bedrock"] as BedrockProviderOptions;
    if (!bedrock || typeof bedrock !== "object") return params;

    const tier = bedrock.serviceTier as ChatCompletionsServiceTier | undefined;
    if (tier === undefined) return params;

    bedrock.serviceTier = toBedrockServiceTier(tier);

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
      // Bedrock Converse API supports "adaptive" natively for Claude Opus 4.6/4.7
      // and Sonnet 4.6 via additionalModelRequestFields. Opus 4.7 *only* supports
      // adaptive — "enabled" returns a 400.
      // https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html
      target.type = thinking.type;
      if ("budgetTokens" in thinking && thinking.budgetTokens !== undefined) {
        target.budgetTokens = thinking.budgetTokens;
      } else if (target.type === "enabled") {
        // Bedrock requires budgetTokens when type is "enabled" — compute a fallback
        // from effort, defaulting to "medium".
        const mappedEffort: ChatCompletionsReasoningEffort =
          effort === "max" ? "xhigh" : ((effort as ChatCompletionsReasoningEffort) ?? "medium");
        target.budgetTokens = calculateReasoningBudgetFromEffort(
          mappedEffort,
          params.maxOutputTokens ?? 65536,
          1024,
        );
      }
    }

    // FUTURE: bedrock currently does not support "effort" for other 4.x models
    if (effort !== undefined && isBedrockEffortCapable(model.modelId)) {
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

    const processCacheControl = (providerOptions?: SharedV4ProviderOptions) => {
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

// Mantle keeps the Bedrock namespace in the model ID (`openai.gpt-5.5`), which the OpenAI
// model cannot recognize as a GPT-5 reasoning model: it would send `max_tokens` plus
// `temperature` and drop `reasoning` entirely. `gpt-oss` genuinely is not one of those.
const isMantleReasoningModel = (modelId: string) =>
  modelId.startsWith("openai.gpt-") && !modelId.startsWith("openai.gpt-oss");

export const bedrockMantleReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!isMantleReasoningModel(model.modelId)) return params;

    const openai = ((params.providerOptions ??= {})["openai"] ??=
      {}) as OpenAILanguageModelResponsesOptions;
    openai.forceReasoning = true;

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

// The InvokeModel endpoint takes the service tier as a request header, with the same tier
// names Converse takes in its body. The Anthropic body's own `service_tier` (`auto` /
// `standard_only`) is not served on Bedrock, so the tier moves out of the provider options,
// where the gateway's tiers would also fail the Anthropic options schema.
//   https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
const BEDROCK_SERVICE_TIER_HEADER = "x-amzn-bedrock-service-tier";

export const bedrockAnthropicServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const anthropic = params.providerOptions?.["anthropic"];
    if (!anthropic || typeof anthropic !== "object") return params;

    const tier = anthropic["serviceTier"] as ChatCompletionsServiceTier | undefined;
    if (tier === undefined) return params;

    anthropic["serviceTier"] = undefined;

    const mapped = toBedrockServiceTier(tier);
    if (mapped) (params.headers ??= {})[BEDROCK_SERVICE_TIER_HEADER] ??= mapped;

    return params;
  },
};

// The nested Anthropic provider takes the Anthropic request shape verbatim, so none of the
// Converse translations above apply to it: `bedrock.anthropic.messages` never matches
// `amazon-bedrock`, and the Claude model middleware already emits that shape.
modelMiddlewareMatcher.useForProvider("bedrock.anthropic*", {
  language: [bedrockAnthropicServiceTierMiddleware],
});

// The nested Mantle provider is OpenAI-shaped, so none of the Converse translations above
// apply to it: `bedrock-mantle.chat` / `bedrock-mantle.responses` never match `amazon-bedrock`.
modelMiddlewareMatcher.useForProvider("bedrock-mantle*", {
  language: [bedrockMantleReasoningMiddleware],
});
