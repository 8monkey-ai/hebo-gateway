import type {
  TranscriptionModelV4,
  TranscriptionModelV4CallOptions,
  TranscriptionModelV4Result,
} from "@ai-sdk/provider";

/**
 * Transcription counterpart of the AI SDK's `LanguageModelMiddleware`.
 * The AI SDK has no transcription model middleware, so the gateway defines a minimal one.
 */
export type TranscriptionModelMiddleware = {
  transformParams?: (options: {
    params: TranscriptionModelV4CallOptions;
    model: TranscriptionModelV4;
  }) => PromiseLike<TranscriptionModelV4CallOptions> | TranscriptionModelV4CallOptions;
  wrapGenerate?: (options: {
    doGenerate: () => PromiseLike<TranscriptionResult>;
    params: TranscriptionModelV4CallOptions;
    model: TranscriptionModelV4;
  }) => PromiseLike<TranscriptionResult>;
};

export type TranscriptionWord = TranscriptionModelV4Result["segments"][number];

/**
 * AI SDK transcription result plus a gateway-level `words` timeline. The AI SDK has a
 * single `segments` array, which some providers fill with single words instead of phrases.
 */
export type TranscriptionResult = TranscriptionModelV4Result & { words?: TranscriptionWord[] };

/**
 * For models whose AI SDK `segments` are single words (e.g. xAI, Vertex Gemini):
 * moves them to `words`, matching OpenAI's `words` / `segments` split.
 */
export const wordSegmentsMiddleware: TranscriptionModelMiddleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    return { ...result, segments: [], words: result.segments };
  },
};

/**
 * Wraps a transcription model with middleware. Like `wrapLanguageModel`, the first
 * middleware transforms params first and wraps the call outermost.
 */
export function wrapTranscriptionModel({
  model,
  middleware,
}: {
  model: TranscriptionModelV4;
  middleware: readonly TranscriptionModelMiddleware[];
}): TranscriptionModelV4 {
  let wrapped = model;
  for (let i = middleware.length - 1; i >= 0; i--) wrapped = wrapOne(wrapped, middleware[i]!);
  return wrapped;
}

function wrapOne(
  model: TranscriptionModelV4,
  { transformParams, wrapGenerate }: TranscriptionModelMiddleware,
): TranscriptionModelV4 {
  if (!transformParams && !wrapGenerate) return model;

  return {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    async doGenerate(options) {
      const params = transformParams ? await transformParams({ params: options, model }) : options;
      const doGenerate = () => model.doGenerate(params);
      return wrapGenerate ? wrapGenerate({ doGenerate, params, model }) : doGenerate();
    },
  };
}
