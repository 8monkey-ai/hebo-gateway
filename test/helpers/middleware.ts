import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/** Runs the `transformParams` of a language model middleware. */
export const transform = (
  middleware: LanguageModelMiddleware,
  params: Partial<LanguageModelV4CallOptions>,
  modelId?: string,
) =>
  middleware.transformParams!({
    type: "generate",
    params: { prompt: [], ...params },
    model: new MockLanguageModelV4(modelId ? { modelId } : {}),
  });

/** Call params carrying the gateway reasoning options, as the endpoints build them. */
export const withReasoning = (
  reasoning: JSONObject,
  extra: Partial<LanguageModelV4CallOptions> = {},
): Partial<LanguageModelV4CallOptions> => ({
  ...extra,
  providerOptions: {
    unknown: {
      reasoning,
      ...(typeof reasoning["effort"] === "string" && { reasoning_effort: reasoning["effort"] }),
    },
  },
});
