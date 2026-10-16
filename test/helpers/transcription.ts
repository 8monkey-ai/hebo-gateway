import type { TranscriptionModelV4CallOptions, TranscriptionModelV4Result } from "@ai-sdk/provider";
import { MockTranscriptionModelV4 } from "ai/test";

import { convertToTranscriptionCallOptions } from "../../src/endpoints/audio-transcriptions/converters";
import { modelMiddlewareMatcher } from "../../src/middleware/matcher";
import {
  type TranscriptionResult,
  wrapTranscriptionModel,
} from "../../src/middleware/transcription";
import type { ModelId } from "../../src/models/types";

const AUDIO = new Uint8Array([1, 2, 3]);

type TranscriptionChainArgs = {
  modelId: ModelId;
  provider: string;
  providerModelId?: string;
  inputs?: Record<string, unknown>;
  segments?: TranscriptionModelV4Result["segments"];
};

/**
 * Runs OpenAI transcription params through the full middleware chain
 * (model -> forward params -> provider) against a mock upstream returning `segments`.
 */
export async function runTranscriptionChain(args: TranscriptionChainArgs): Promise<{
  sent: TranscriptionModelV4CallOptions;
  result: TranscriptionResult;
}> {
  let sent: TranscriptionModelV4CallOptions | undefined;
  const model = new MockTranscriptionModelV4({
    provider: args.provider,
    modelId: args.providerModelId ?? args.modelId,
    doGenerate: (options) => {
      sent = options;
      return Promise.resolve({
        text: "",
        segments: args.segments ?? [],
        language: undefined,
        durationInSeconds: undefined,
        warnings: [],
        response: { timestamp: new Date(0), modelId: args.modelId },
      });
    },
  });

  const result = await wrapTranscriptionModel({
    model,
    middleware: modelMiddlewareMatcher.forTranscription(args.modelId, args.provider),
  }).doGenerate(
    convertToTranscriptionCallOptions({
      input_audio: { data: AUDIO, format: "mp3" },
      ...args.inputs,
    }),
  );

  return { sent: sent!, result };
}

/** Returns the provider options the middleware chain sends upstream. */
export async function transcriptionProviderOptions(
  args: Omit<TranscriptionChainArgs, "segments">,
): Promise<TranscriptionModelV4CallOptions["providerOptions"]> {
  return (await runTranscriptionChain(args)).sent.providerOptions;
}
