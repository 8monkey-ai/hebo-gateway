import type { DeepSeekLanguageModelOptions } from "@ai-sdk/deepseek";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

export const deepseekReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["deepseek"] ??= {}) as DeepSeekLanguageModelOptions;

    if (reasoning.enabled === false || reasoning.effort === "none") {
      target.thinking = { type: "disabled" };
    } else if (reasoning.enabled) {
      target.thinking = { type: "enabled" };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("deepseek/deepseek-v3.2", {
  language: [deepseekReasoningMiddleware],
});
