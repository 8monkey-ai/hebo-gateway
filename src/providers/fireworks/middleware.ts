import type { FireworksLanguageModelOptions } from "@ai-sdk/fireworks";
import type { LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema.ts";
import { defineSpecMiddleware, modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning } from "../../middleware/reasoning.ts";

/**
 * Maps the reasoning params no lab middleware took (e.g. for labs without one) to what the
 * model takes per its spec (models.dev). Models without one get a thinking toggle.
 */
export const fireworksReasoningMiddleware = defineSpecMiddleware(
  (spec): LanguageModelMiddleware => {
    const controls = reasoningControls(spec, { toggle: true });
    return {
      specificationVersion: "v3",
      // oxlint-disable-next-line require-await
      transformParams: async ({ params }) => {
        const fireworks = params.providerOptions?.["fireworks"] as
          | (FireworksLanguageModelOptions & {
              reasoning?: ChatCompletionsReasoningConfig;
              // Read by the OpenAI-compatible chat model underneath.
              reasoningEffort?: string;
            })
          | undefined;
        const reasoning = fireworks?.reasoning;
        if (!reasoning) return params;

        fireworks.reasoning = undefined;
        if (!controls) return params;
        const resolved = resolveReasoning(
          reasoning,
          controls,
          params.maxOutputTokens ?? spec.output,
        );
        if (!resolved) return params;

        if (controls.toggle || resolved.budget !== undefined) {
          fireworks.thinking = resolved.enabled
            ? { type: "enabled", budgetTokens: resolved.budget }
            : { type: "disabled" };
        }
        if (resolved.effort) {
          fireworks.reasoningEffort = resolved.effort;
        }

        return params;
      },
    };
  },
);

modelMiddlewareMatcher.useForProvider("fireworks", {
  language: [fireworksReasoningMiddleware],
});
