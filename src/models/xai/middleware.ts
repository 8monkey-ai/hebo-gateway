import type { XaiLanguageModelResponsesOptions } from "@ai-sdk/xai";
import type { LanguageModelMiddleware } from "ai";

import { defineSpecMiddleware, modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import type { ReasoningControls } from "../types.ts";

// Current generation, assumed for models without reasoning data (e.g. custom ones).
const GROK: ReasoningControls = { effort: ["low", "medium", "high", "xhigh"] };

/**
 * Effort levels come from the model spec (models.dev). Models that take no effort (e.g. the
 * Grok 4.20 reasoning line) reject `reasoning_effort` outright, so nothing is sent to them.
 */
export const xaiReasoningMiddleware = defineSpecMiddleware((spec): LanguageModelMiddleware => {
  const controls = reasoningControls(spec, GROK);
  return {
    specificationVersion: "v3",
    // oxlint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const reasoning = takeReasoning(params);
      if (!reasoning || !controls) return params;

      // `none` is what actually disables thinking, on the models that take it.
      const effort = resolveReasoning(reasoning, controls)?.effort;
      if (effort) {
        (
          (params.providerOptions!["xai"] ??= {}) as XaiLanguageModelResponsesOptions
        ).reasoningEffort = effort as XaiLanguageModelResponsesOptions["reasoningEffort"];
      }

      return params;
    },
  };
});

modelMiddlewareMatcher.useForModel("xai/*", { language: [xaiReasoningMiddleware] });
