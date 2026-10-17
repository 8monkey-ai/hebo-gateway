import { expect, test } from "bun:test";

import { transcriptionProviderOptions } from "../../../test/helpers/transcription";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { azureTranscriptionOptionsMiddleware } from "./middleware";

test("azureTranscriptionOptionsMiddleware > matching patterns", () => {
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", providerId: "azure.transcription" }),
  ).toContain(azureTranscriptionOptionsMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", providerId: "openai.transcription" }),
  ).not.toContain(azureTranscriptionOptionsMiddleware);
});

test("azureTranscriptionOptionsMiddleware > sends Azure OpenAI options to the openai namespace", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "custom/transcribe",
      provider: "azure.transcription",
      inputs: { prompt: "hi" },
    }),
  ).toEqual({ openai: { prompt: "hi" } });
});

test("azureTranscriptionOptionsMiddleware > keeps options for an explicit Speech API", async () => {
  expect(
    await transcriptionProviderOptions({
      modelId: "custom/transcribe",
      provider: "azure.transcription",
      inputs: { api: "speech", locales: ["en"] },
    }),
  ).toEqual({ azure: { api: "speech", locales: ["en"] } });
});
