import { expect, test } from "bun:test";

import { transcriptionProviderOptions } from "../../../test/helpers/transcription";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { azureTranscriptionOptionsMiddleware } from "../../providers/azure/middleware";
import { maiTranscribeMiddleware } from "./middleware";

test("maiTranscribeMiddleware > matching patterns", () => {
  expect(
    modelMiddlewareMatcher.resolve({
      kind: "transcription",
      modelId: "microsoft/mai-transcribe-2",
    }),
  ).toContain(maiTranscribeMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", modelId: "openai/gpt-transcribe" }),
  ).not.toContain(maiTranscribeMiddleware);
});

test("maiTranscribeMiddleware > selects the Speech API and maps params", async () => {
  // Runs before the Azure provider middleware, which keeps Speech API options in `azure`.
  expect(
    modelMiddlewareMatcher.forTranscription("microsoft/mai-transcribe-2", "azure.transcription"),
  ).toContain(azureTranscriptionOptionsMiddleware);
  expect(
    await transcriptionProviderOptions({
      modelId: "microsoft/mai-transcribe-2",
      provider: "azure.transcription",
      providerModelId: "mai-transcribe-2",
      inputs: {
        language: "en",
        timestamp_granularities: ["word"],
        diarization: { enabled: true },
      },
    }),
  ).toEqual({
    azure: {
      api: "speech",
      locales: ["en"],
      timestamps: "word",
      diarization: { enabled: true },
    },
  });
});

test("maiTranscribeMiddleware > selects the Speech API without params", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "microsoft/mai-transcribe-2",
      provider: "azure.transcription",
      providerModelId: "mai-transcribe-2",
    }),
  ).toEqual({ azure: { api: "speech" } });
});

test("maiTranscribeMiddleware > forwards unsupported params for upstream to validate", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "microsoft/mai-transcribe-2",
      provider: "azure.transcription",
      providerModelId: "mai-transcribe-2",
      inputs: { prompt: "hi" },
    }),
  ).toEqual({ azure: { api: "speech", prompt: "hi" } });
});
