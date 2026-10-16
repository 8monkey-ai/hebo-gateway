import type { TranscriptionModelV4CallOptions } from "@ai-sdk/provider";
import { MockTranscriptionModelV4 } from "ai/test";

import { convertToTranscriptionCallOptions } from "../../src/endpoints/audio-transcriptions/converters";
import { modelMiddlewareMatcher } from "../../src/middleware/matcher";
import { wrapTranscriptionModel } from "../../src/middleware/transcription";
import type { ModelId } from "../../src/models/types";

const AUDIO = new Uint8Array([1, 2, 3]);

/**
 * Runs OpenAI transcription params through the full middleware chain
 * (model -> forward params -> provider) and returns the provider options sent upstream.
 */
export async function transcriptionProviderOptions(args: {
  modelId: ModelId;
  provider: string;
  providerModelId?: string;
  inputs?: Record<string, unknown>;
}): Promise<TranscriptionModelV4CallOptions["providerOptions"]> {
  let sent: TranscriptionModelV4CallOptions | undefined;
  const model = new MockTranscriptionModelV4({
    provider: args.provider,
    modelId: args.providerModelId ?? args.modelId,
    doGenerate: (options) => {
      sent = options;
      return Promise.resolve({
        text: "",
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
        warnings: [],
        response: { timestamp: new Date(0), modelId: args.modelId },
      });
    },
  });

  await wrapTranscriptionModel({
    model,
    middleware: modelMiddlewareMatcher.forTranscription(args.modelId, args.provider),
  }).doGenerate(
    convertToTranscriptionCallOptions({
      input_audio: { data: AUDIO, format: "mp3" },
      ...args.inputs,
    }),
  );

  return sent!.providerOptions;
}

/** Like `transcriptionProviderOptions`, but returns the error message the chain throws. */
export const transcriptionError = (args: Parameters<typeof transcriptionProviderOptions>[0]) =>
  transcriptionProviderOptions(args).then(
    () => "no error",
    (error: Error) => error.message,
  );
