import type { AlibabaLanguageModelOptions } from "@ai-sdk/alibaba";
import type { LanguageModelMiddleware } from "ai";

import { defineSpecMiddleware, modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import type { ReasoningControls } from "../types.ts";

// Assumed for models without reasoning data (e.g. custom ones).
const QWEN: ReasoningControls = { toggle: true, budget: {} };

// Qwen takes a thinking toggle and a thinking budget. What each model takes comes from its
// spec (models.dev).
export const qwenReasoningMiddleware = defineSpecMiddleware((spec): LanguageModelMiddleware => {
  const controls = reasoningControls(spec, QWEN);
  return {
    specificationVersion: "v3",
    // oxlint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const reasoning = takeReasoning(params);
      if (!reasoning || !controls) return params;

      const resolved = resolveReasoning(reasoning, controls, params.maxOutputTokens ?? spec.output);
      if (!resolved) return params;

      const target = (params.providerOptions!["alibaba"] ??= {}) as AlibabaLanguageModelOptions;
      if (controls.toggle) target.enableThinking = resolved.enabled;
      if (resolved.enabled && resolved.budget !== undefined)
        target.thinkingBudget = resolved.budget;

      return params;
    },
  };
});

modelMiddlewareMatcher.useForModel("alibaba/*", {
  language: [qwenReasoningMiddleware],
});
