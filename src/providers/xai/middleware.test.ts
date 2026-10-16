import { expect, test } from "bun:test";

import {
  transcriptionError,
  transcriptionProviderOptions,
} from "../../../test/helpers/transcription";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { xaiTranscriptionMiddleware } from "./middleware";

test("xaiTranscriptionMiddleware > matching patterns", () => {
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", providerId: "xai.transcription" }),
  ).toContain(xaiTranscriptionMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "text", providerId: "xai.transcription" }),
  ).not.toContain(xaiTranscriptionMiddleware);
});

test("xaiTranscriptionMiddleware > drops timestamp granularities", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "xai/grok-voice-transcribe-2.0",
      provider: "xai.transcription",
      providerModelId: "grok-voice-transcribe-2.0",
      inputs: { language: "es", timestamp_granularities: ["word"], diarize: true },
    }),
  ).toEqual({ xai: { language: "es", diarize: true } });
});

test("xaiTranscriptionMiddleware > rejects prompt", async () => {
  expect(
    await transcriptionError({
      modelId: "xai/grok-voice-transcribe-2.0",
      provider: "xai.transcription",
      inputs: { prompt: "context" },
    }),
  ).toBe("Parameter 'prompt' is not supported by provider 'xai'");
});
