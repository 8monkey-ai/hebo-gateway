import type { LanguageModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import { specOf } from "../../providers/registry.ts";
import type { ReasoningControls } from "../types.ts";

// Current generation, assumed for models without reasoning data (e.g. custom ones).
const MINIMAX: ReasoningControls = { effort: ["low", "medium", "high", "xhigh", "max"] };

// MiniMax takes the OpenAI-compatible `reasoning_effort`, `none` turning thinking off. What
// each model takes comes from its spec (models.dev).
export const minimaxReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const spec = specOf(model);
    const controls = reasoningControls(spec, MINIMAX);
    const reasoning = takeReasoning(params);
    if (!reasoning || !controls) return params;

    // max_tokens not supported by MiniMax reasoning
    const resolved = resolveReasoning(reasoning, controls);
    const effort = resolved?.enabled === false ? "none" : resolved?.effort;
    if (effort) params.providerOptions!["unknown"]!["reasoning_effort"] = effort;

    return params;
  },
};

modelMiddlewareMatcher.useForModel("minimax/*", {
  language: [minimaxReasoningMiddleware],
});
