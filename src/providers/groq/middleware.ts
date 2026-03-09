import type { LanguageModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { ChatCompletionsServiceTier } from "../../endpoints/chat-completions";
import type { GroqProviderOptions } from "@ai-sdk/groq";

// https://console.groq.com/docs/service-tiers
export const groqServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const groq = params.providerOptions?.["groq"] as GroqProviderOptions;
    if (!groq || typeof groq !== "object") return params;

    const tier = groq.serviceTier as ChatCompletionsServiceTier | undefined;
    switch (tier) {
      case undefined:
        return params;
      case "auto":
      case "flex":
        return params;
      case "default":
        groq.serviceTier = "on_demand";
        return params;
      case "scale":
      case "priority":
        // @ts-expect-error AI SDK missing "performance", need to open PR
        groq.serviceTier = "performance";
        return params;
    }
  },
};

modelMiddlewareMatcher.useForProvider("groq.*", {
  language: [groqServiceTierMiddleware],
});
