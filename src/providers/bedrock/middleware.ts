import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsCacheControl } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

const isClaude46 = (modelId: string) => modelId.includes("-4-6");

export const bedrockGptReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("gpt")) return params;

    const bedrock = params.providerOptions?.["bedrock"];
    if (!bedrock || typeof bedrock !== "object") return params;

    const effort = bedrock["reasoningEffort"];
    if (effort === undefined) return params;

    const target = (bedrock["reasoningConfig"] ??= {}) as Record<string, unknown>;
    target["maxReasoningEffort"] = effort;

    delete bedrock["reasoningEffort"];

    return params;
  },
};

export const bedrockClaudeReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("claude")) return params;

    const bedrock = params.providerOptions?.["bedrock"];
    if (!bedrock || typeof bedrock !== "object") return params;

    const thinking = bedrock["thinking"];
    const effort = bedrock["effort"];

    if (!thinking && effort === undefined) return params;

    const target = (bedrock["reasoningConfig"] ??= {}) as Record<string, unknown>;

    if (thinking && typeof thinking === "object") {
      const thinkingOptions = thinking as Record<string, unknown>;
      if (thinkingOptions["type"] !== undefined) {
        target["type"] = thinkingOptions["type"];
      }
      if (thinkingOptions["budgetTokens"] !== undefined) {
        target["budgetTokens"] = thinkingOptions["budgetTokens"];
      }
    }

    // FUTURE: bedrock currently does not support "effort" for other 4.x models
    if (effort !== undefined && isClaude46(model.modelId)) {
      target["maxReasoningEffort"] = effort;
    }

    delete bedrock["thinking"];
    delete bedrock["effort"];

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
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("nova") && !model.modelId.includes("claude")) return params;

    let hasExplicitCacheControl = false;
    let lastCacheableBlock;

    const processCacheControl = (providerOptions?: Record<string, any>) => {
      if (!providerOptions) return;

      const entryBedrock = providerOptions["bedrock"] as Record<string, unknown> | undefined;
      const entryCacheControl = entryBedrock?.["cacheControl"] as ChatCompletionsCacheControl;
      if (!entryBedrock || !entryCacheControl) return;

      hasExplicitCacheControl = true;
      entryBedrock["cachePoint"] = toBedrockCachePoint(model.modelId, entryCacheControl);
      delete entryBedrock["cacheControl"];
    };

    for (const message of params.prompt) {
      processCacheControl(message["providerOptions"]);

      if (!Array.isArray(message["content"])) continue;
      for (const part of message["content"]) {
        processCacheControl(part["providerOptions"]);
      }
      lastCacheableBlock = message;
    }

    const bedrock = params.providerOptions?.["bedrock"];
    const cacheControl = bedrock?.["cacheControl"] as ChatCompletionsCacheControl;
    if (cacheControl && !hasExplicitCacheControl) {
      if (lastCacheableBlock) {
        ((lastCacheableBlock["providerOptions"] ??= {})["bedrock"] ??= {})["cachePoint"] =
          toBedrockCachePoint(model.modelId, cacheControl);
      }
    }

    delete bedrock?.["cacheControl"];

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  language: [
    bedrockGptReasoningMiddleware,
    bedrockClaudeReasoningMiddleware,
    bedrockPromptCachingMiddleware,
  ],
});
