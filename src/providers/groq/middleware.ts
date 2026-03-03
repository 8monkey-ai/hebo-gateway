import type { LanguageModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// https://console.groq.com/docs/service-tiers
export const groqServiceTierMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const groq = params.providerOptions?.["groq"];
    if (!groq || typeof groq !== "object") return params;

    const tier = groq["serviceTier"];
    switch (tier) {
      case "auto":
      case "flex":
        return params;
      case "default":
        groq["serviceTier"] = "on_demand";
        return params;
      case "scale":
      case "priority":
        groq["serviceTier"] = "performance";
        return params;
      default:
        return params;
    }
  },
};

modelMiddlewareMatcher.useForProvider("groq.*", {
  language: [groqServiceTierMiddleware],
});
