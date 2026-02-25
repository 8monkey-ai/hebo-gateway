import type { LanguageModelMiddleware } from "ai";

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

modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  language: [bedrockGptReasoningMiddleware, bedrockClaudeReasoningMiddleware],
});
