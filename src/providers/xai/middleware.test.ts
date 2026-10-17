import { expect, test } from "bun:test";

import { runTranscriptionChain } from "../../../test/helpers/transcription";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { wordSegmentsMiddleware } from "../../middleware/transcription";
// Registers the xAI transcription middleware.
// oxlint-disable-next-line import/no-unassigned-import
import "./middleware";

test("xai transcription > matching patterns", () => {
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", providerId: "xai.transcription" }),
  ).toContain(wordSegmentsMiddleware);
  expect(
    modelMiddlewareMatcher.resolve({ kind: "transcription", providerId: "openai.transcription" }),
  ).not.toContain(wordSegmentsMiddleware);
});

test("xai transcription > returns word timings as words, not segments", async () => {
  const words = [
    { text: "hola", startSecond: 0, endSecond: 0.3 },
    { text: "mundo", startSecond: 0.3, endSecond: 0.8 },
  ];

  const { result } = await runTranscriptionChain({
    modelId: "xai/grok-voice-transcribe-2.0",
    provider: "xai.transcription",
    providerModelId: "grok-voice-transcribe-2.0",
    segments: words,
  });
  expect(result.segments).toEqual([]);
  expect(result.words).toEqual(words);
});
