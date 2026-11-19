import type { LanguageModelMiddleware } from "ai";

import type { ReasoningControls } from "../models/types.ts";
import { defineSpecMiddleware, type SpecMiddleware } from "./matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "./reasoning.ts";

/**
 * Reasoning middleware for the labs whose API takes a `thinking: { type }` toggle and a
 * `reasoningEffort` level (DeepSeek, Kimi, GLM). What each model takes comes from its spec
 * (models.dev), `fallback` for models without one.
 */
export function thinkingReasoningMiddleware(
  namespace: string,
  fallback: ReasoningControls,
): SpecMiddleware<LanguageModelMiddleware> {
  return defineSpecMiddleware((spec): LanguageModelMiddleware => {
    const controls = reasoningControls(spec, fallback);
    return {
      specificationVersion: "v3",
      // oxlint-disable-next-line require-await
      transformParams: async ({ params }) => {
        const reasoning = takeReasoning(params);
        if (!reasoning || !controls) return params;

        const resolved = resolveReasoning(reasoning, controls);
        if (!resolved) return params;

        const target = (params.providerOptions![namespace] ??= {});
        if (controls.toggle)
          target["thinking"] = { type: resolved.enabled ? "enabled" : "disabled" };
        if (resolved.effort) target["reasoningEffort"] = resolved.effort;

        return params;
      },
    };
  });
}
