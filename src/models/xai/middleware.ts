import type { XaiLanguageModelResponsesOptions } from "@ai-sdk/xai";
import type { LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

/**
 * The Grok 4.20 line rejects `reasoning_effort` outright, dated variants included, while its
 * multi-agent sibling accepts it. The SDK gates this itself, but only for its own top-level
 * `reasoning` option: writing `providerOptions.xai.reasoningEffort` short-circuits that check,
 * so the gate has to be mirrored here.
 */
const rejectsEffort = (modelId: string) =>
  modelId.startsWith("grok-4.20") && modelId.endsWith("-reasoning");

/** `xhigh` is Grok 4.6 only — anything above `high` collapses back to it elsewhere. */
function mapXaiReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
  modelId: string,
): XaiLanguageModelResponsesOptions["reasoningEffort"] {
  switch (effort) {
    case "none":
      return "none";
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
    case "max":
      return modelId === "grok-4.6" ? "xhigh" : "high";
  }

  return undefined;
}

export const xaiReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["xai"] ??= {}) as XaiLanguageModelResponsesOptions;

    if (rejectsEffort(model.modelId)) {
      // FUTURE: warn that the requested effort was dropped for a model that rejects it
      target.reasoningEffort = undefined;
    } else if (reasoning.enabled === false) {
      // `none` is what actually disables thinking; omitting the field leaves the model at
      // its own default, which is not what "reasoning off" asked for.
      target.reasoningEffort = "none";
    } else if (reasoning.effort) {
      target.reasoningEffort = mapXaiReasoningEffort(reasoning.effort, model.modelId);
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel(
  [
    "xai/grok-4.1-fast-reasoning",
    "xai/grok-4.2-reasoning",
    "xai/grok-4.2-multi-agent",
    "xai/grok-4.3",
    "xai/grok-4.5",
    "xai/grok-4.6",
  ],
  { language: [xaiReasoningMiddleware] },
);
