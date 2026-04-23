import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

type ChatTemplateKwargs = {
  enable_thinking?: boolean;
  low_effort?: boolean;
};

export const nvidiaReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const nvidia = params.providerOptions?.["nvidia"] as Record<string, unknown> | undefined;
    if (!nvidia || typeof nvidia !== "object") return params;

    const reasoning = nvidia["reasoning"] as ChatCompletionsReasoningConfig | undefined;
    if (!reasoning) return params;

    const kwargs: ChatTemplateKwargs =
      (nvidia["chatTemplateKwargs"] as ChatTemplateKwargs) ?? {};

    if (reasoning.enabled === false || reasoning.effort === "none") {
      kwargs.enable_thinking = false;
    } else if (reasoning.enabled) {
      kwargs.enable_thinking = true;
    }

    nvidia["chat_template_kwargs"] = kwargs;
    delete nvidia["chatTemplateKwargs"];
    delete nvidia["reasoning"];

    return params;
  },
};

export const nemotronReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    if (!model.modelId.includes("nemotron")) return params;

    const nvidia = params.providerOptions?.["nvidia"] as Record<string, unknown> | undefined;
    if (!nvidia || typeof nvidia !== "object") return params;

    const reasoning = nvidia["reasoning"] as ChatCompletionsReasoningConfig | undefined;
    if (!reasoning?.enabled || reasoning.effort === "none") return params;

    const kwargs: ChatTemplateKwargs =
      (nvidia["chatTemplateKwargs"] as ChatTemplateKwargs) ?? {};

    if (reasoning.effort === "minimal" || reasoning.effort === "low") {
      kwargs.low_effort = true;
      nvidia["chatTemplateKwargs"] = kwargs;
    }

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("nvidia", {
  language: [nemotronReasoningMiddleware, nvidiaReasoningMiddleware],
});
