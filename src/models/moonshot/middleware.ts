import type { MoonshotAILanguageModelOptions } from "@ai-sdk/moonshotai";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

export const moonshotReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["moonshotai"] ??=
      {}) as MoonshotAILanguageModelOptions;

    if (reasoning.enabled === false) {
      target.thinking = { type: "disabled" };
    } else {
      const thinking: MoonshotAILanguageModelOptions["thinking"] = {
        type: "enabled",
        budgetTokens: reasoning.max_tokens,
      };
      target.thinking = thinking;
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("moonshot/*", {
  language: [moonshotReasoningMiddleware],
});
