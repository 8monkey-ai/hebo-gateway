import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsServiceTier } from "../../endpoints/chat-completions";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Anthropic knows two tiers: `auto` (priority capacity allowed) and `standard_only`.
// `flex` / `priority` / `scale` have no equivalent and would fail the provider-options
// schema, so they are dropped instead of failing the request.
// https://platform.claude.com/docs/en/api/service-tiers
export const anthropicServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const anthropic = params.providerOptions?.["anthropic"] as AnthropicProviderOptions;
    if (!anthropic || typeof anthropic !== "object") return params;

    const tier = anthropic.serviceTier as ChatCompletionsServiceTier | undefined;
    switch (tier) {
      case undefined:
      case "auto":
        return params;
      case "default":
        anthropic.serviceTier = "standard_only";
        return params;
      case "flex":
      case "priority":
      case "scale":
        anthropic.serviceTier = undefined;
        return params;
    }

    return params;
  },
};

modelMiddlewareMatcher.useForProvider("anthropic.*", {
  language: [anthropicServiceTierMiddleware],
});
