import type { JSONObject, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import type { ModelSpec } from "../../src/models/types.ts";
import { setModelSpec } from "../../src/providers/registry.ts";

let models = 0;

/**
 * A mock model whose spec (read by middleware with `specOf`) is `spec`. Each one has its own
 * provider name, so specs never leak between tests.
 */
export const mockModel = (modelId?: string, spec?: ModelSpec) =>
  setModelSpec(
    new MockLanguageModelV4({ provider: `mock-${++models}`, ...(modelId && { modelId }) }),
    spec,
  );

/** Runs the `transformParams` of a language model middleware, for a model served with `spec`. */
export const transform = (
  middleware: LanguageModelMiddleware,
  params: Partial<LanguageModelV4CallOptions>,
  model: { modelId?: string; spec?: ModelSpec } | string = {},
) => {
  const { modelId, spec } = typeof model === "string" ? { modelId: model } : model;
  return middleware.transformParams!({
    type: "generate",
    params: { prompt: [], ...params },
    model: mockModel(modelId, spec),
  });
};

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
