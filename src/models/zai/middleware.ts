import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";

export const glmReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["zhipu"] ??= {}) as Record<string, unknown>;

    if (!reasoning.enabled || reasoning.effort === "none") {
      target["thinking"] = { type: "disabled" };
    } else {
      target["thinking"] = { type: "enabled" };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("zhipuai/glm-*", {
  language: [glmReasoningMiddleware],
});
