import type { LanguageModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

export const bedrockAnthropicReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("claude")) return params;

    const bedrock = params.providerOptions?.["bedrock"];
    if (!bedrock || typeof bedrock !== "object") return params;

    const bedrockOptions = bedrock as Record<string, unknown>;
    const thinking = bedrockOptions["thinking"];
    const effort = bedrockOptions["effort"];

    if (!thinking && effort === undefined) return params;

    const target = (bedrockOptions["reasoningConfig"] ??= {}) as Record<string, unknown>;

    if (thinking && typeof thinking === "object") {
      const thinkingOptions = thinking as Record<string, unknown>;
      if (thinkingOptions["type"] !== undefined) {
        target["type"] = thinkingOptions["type"];
      }
      if (thinkingOptions["budgetTokens"] !== undefined) {
        target["budgetTokens"] = thinkingOptions["budgetTokens"];
      }
    }

    if (effort !== undefined) target["maxReasoningEffort"] = effort;

    delete bedrockOptions["thinking"];
    delete bedrockOptions["effort"];

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("amazon-bedrock", {
  language: [bedrockAnthropicReasoningMiddleware],
});
