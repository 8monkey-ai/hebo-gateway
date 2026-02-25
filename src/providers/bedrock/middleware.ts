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

function toBedrockCachePoint(cacheControl?: ChatCompletionsCacheControl, modelId?: string) {
  const out: { type: "default"; ttl?: string } = { type: "default" };
  if (cacheControl?.ttl) {
    out.ttl = modelId?.includes("nova") ? "5m" : cacheControl.ttl;
  }
  return out;
}

export const bedrockPromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("nova") && !model.modelId.includes("claude")) return params;

    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let hasExplicitCacheControl = false;
    let firstUser;
    let lastSystem;

    const processCacheControl = (providerOptions?: Record<string, any>) => {
      if (!providerOptions) return;

      const entryUnknown = providerOptions["unknown"] as Record<string, unknown> | undefined;
      const entryCacheControl = entryUnknown?.["cacheControl"] as ChatCompletionsCacheControl;
      if (!entryUnknown || !entryCacheControl) return;

      hasExplicitCacheControl = true;
      entryUnknown["cachePoint"] = toBedrockCachePoint(entryCacheControl, model.modelId);
      delete entryUnknown["cacheControl"];
    };

    for (const message of params.prompt) {
      if (message["role"] === "system") lastSystem = message;
      if (!firstUser && message["role"] === "user") firstUser = message;

      processCacheControl(message["providerOptions"] as Record<string, any> | undefined);

      if (!Array.isArray(message["content"])) continue;
      for (const part of message["content"]) {
        processCacheControl((part as any)["providerOptions"] as Record<string, any> | undefined);
      }
    }

    const cacheControl = unknown["cacheControl"] as ChatCompletionsCacheControl;
    if (cacheControl && !hasExplicitCacheControl) {
      const target = lastSystem ?? firstUser;
      if (target) {
        ((target["providerOptions"] ??= {})["unknown"] ??= {})["cachePoint"] = toBedrockCachePoint(
          cacheControl,
          model.modelId,
        );
      }
    }

    delete unknown["cacheControl"];

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
