import type { LanguageModelMiddleware } from "ai";

import { defineSpecMiddleware, modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import type { ReasoningControls } from "../types.ts";

// Current generation, assumed for models without reasoning data (e.g. custom ones).
const MINIMAX: ReasoningControls = { effort: ["low", "medium", "high", "xhigh", "max"] };

// MiniMax takes the OpenAI-compatible `reasoning_effort`, `none` turning thinking off. What
// each model takes comes from its spec (models.dev).
export const minimaxReasoningMiddleware = defineSpecMiddleware((spec): LanguageModelMiddleware => {
  const controls = reasoningControls(spec, MINIMAX);
  return {
    specificationVersion: "v3",
    // oxlint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const reasoning = takeReasoning(params);
      if (!reasoning || !controls) return params;

      // max_tokens not supported by MiniMax reasoning
      const resolved = resolveReasoning(reasoning, controls);
      const effort = resolved?.enabled === false ? "none" : resolved?.effort;
      if (effort) params.providerOptions!["unknown"]!["reasoning_effort"] = effort;

      return params;
    },
  };
});

modelMiddlewareMatcher.useForModel("minimax/*", {
  language: [minimaxReasoningMiddleware],
});
