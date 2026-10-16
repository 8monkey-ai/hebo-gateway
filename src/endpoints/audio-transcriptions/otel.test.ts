import { describe, expect, test } from "bun:test";

import { getTranscriptionsRequestAttributes, getTranscriptionsResponseAttributes } from "./otel";
import type { Transcriptions, TranscriptionsBody } from "./schema";

const body: TranscriptionsBody = {
  model: "openai/whisper-1",
  input_audio: { data: new Uint8Array([1, 2, 3]), format: "wav" },
  prompt: "Meeting notes",
  temperature: 0.2,
};

const transcriptions: Transcriptions = {
  text: "hello world",
  usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12, seconds: 1.5 },
};

describe("Audio Transcriptions OTEL", () => {
  test("should never record raw audio data", () => {
    const attrs = getTranscriptionsRequestAttributes(body, "full");

    expect(attrs["gen_ai.request.temperature"]).toBe(0.2);
    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [
          {
            type: "blob",
            modality: "audio",
            mime_type: "audio/wav",
            content: "[REDACTED_BINARY_DATA]",
          },
          { type: "text", content: "Meeting notes" },
        ],
      }),
    ]);
  });

  test("should map usage including audio seconds", () => {
    const attrs = getTranscriptionsResponseAttributes(transcriptions, "recommended");

    expect(attrs).toEqual({
      "gen_ai.usage.input_tokens": 10,
      "gen_ai.usage.output_tokens": 2,
      "gen_ai.usage.total_tokens": 12,
      "gen_ai.usage.audio_seconds": 1.5,
    });
  });

  test("should record the transcript only at full signal level", () => {
    expect(
      getTranscriptionsResponseAttributes(transcriptions, "recommended")["gen_ai.output.messages"],
    ).toBeUndefined();
    expect(
      getTranscriptionsResponseAttributes(transcriptions, "full")["gen_ai.output.messages"],
    ).toEqual([
      JSON.stringify({ role: "assistant", parts: [{ type: "text", content: "hello world" }] }),
    ]);
  });
});
