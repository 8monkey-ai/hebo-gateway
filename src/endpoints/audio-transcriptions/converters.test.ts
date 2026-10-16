import { describe, expect, test } from "bun:test";

import { forwardTranscriptionParams } from "../../middleware/common";
import {
  convertFormDataToTranscriptionsBody,
  convertToTranscriptionCallOptions,
  toTranscriptionsUsage,
} from "./converters";

const AUDIO = new Uint8Array([1, 2, 3]);

const forwarded = (inputs: Record<string, unknown>, provider: string, modelId = "model") =>
  forwardTranscriptionParams(provider).transformParams(
    convertToTranscriptionCallOptions(
      { input_audio: { data: AUDIO, format: "mp3" }, ...inputs },
      provider,
      modelId,
    ),
  ).providerOptions;

describe("Audio Transcriptions Converters", () => {
  describe("convertFormDataToTranscriptionsBody", () => {
    test("should convert form fields and the file upload", async () => {
      const form = new FormData();
      form.append("model", "openai/whisper-1");
      form.append("file", new File([AUDIO], "clip.M4A"));
      form.append("prompt", "123");
      form.append("temperature", "0");
      form.append("timestamp_granularities[]", "word");
      form.append("chunking_strategy", '{"type":"server_vad","threshold":0.5}');

      expect(await convertFormDataToTranscriptionsBody(form)).toEqual({
        model: "openai/whisper-1",
        prompt: "123",
        temperature: 0,
        timestamp_granularities: ["word"],
        chunking_strategy: { type: "server_vad", threshold: 0.5 },
        input_audio: { data: AUDIO, format: "m4a" },
      });
    });

    test("should ignore __proto__ fields", async () => {
      const form = new FormData();
      form.append("__proto__", '{"model":"injected"}');
      form.append("__proto__[]", "x");
      form.append("file", new File([AUDIO], "clip.mp3"));

      const body = await convertFormDataToTranscriptionsBody(form);
      expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
      expect(body["model"]).toBeUndefined();
    });

    test("should truncate long filenames in format errors", async () => {
      const form = new FormData();
      form.append("file", new File([AUDIO], `${"a".repeat(500)}.xyz`));

      try {
        await convertFormDataToTranscriptionsBody(form);
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect((err as Error).message).toContain(`'${"a".repeat(100)}…'`);
      }
    });

    test("should derive the format from the media type when the filename has no extension", async () => {
      const form = new FormData();
      form.append("file", new File([AUDIO], "blob", { type: "audio/x-wav" }));

      const body = await convertFormDataToTranscriptionsBody(form);
      expect(body["input_audio"]).toEqual({ data: AUDIO, format: "wav" });
    });
  });

  describe("convertToTranscriptionCallOptions", () => {
    test("should map OpenAI params into the openai namespace", () => {
      const options = convertToTranscriptionCallOptions(
        {
          input_audio: { data: AUDIO, format: "mp3" },
          language: "en",
          response_format: "verbose_json",
        },
        "openai.transcription",
        "whisper-1",
      );

      expect(options.audio).toBe(AUDIO);
      expect(options.mediaType).toBe("audio/mp3");
      expect(options.providerOptions).toEqual({ unknown: { language: "en" } });
    });

    test("should send Azure options to the openai namespace", () => {
      expect(forwarded({ prompt: "hi" }, "azure.transcription")).toEqual({
        openai: { prompt: "hi" },
      });
    });

    test("should request verbose_json from Groq", () => {
      expect(forwarded({ language: "en" }, "groq.transcription")).toEqual({
        groq: { language: "en", responseFormat: "verbose_json" },
      });
    });

    test("should map language and word timestamps for Vertex Gemini", () => {
      expect(
        forwarded(
          { language: "en-US", timestamp_granularities: ["word"] },
          "google.vertex.transcription",
          "gemini-3.5-transcribe",
        ),
      ).toEqual({
        vertex: { languageCodes: ["en-US"], wordTimestamp: true },
      });
    });

    test("should not send a word timestamp toggle for Vertex Chirp", () => {
      expect(
        forwarded({ timestamp_granularities: ["word"] }, "google.vertex.transcription", "chirp_3"),
      ).toEqual({});
    });

    test("should reject temperature for Vertex", () => {
      expect(() =>
        convertToTranscriptionCallOptions(
          { input_audio: { data: AUDIO, format: "mp3" }, temperature: 0.5 },
          "google.vertex.transcription",
          "chirp_3",
        ),
      ).toThrow("Parameter 'temperature' is not supported by provider 'vertex'");
    });

    test("should forward extra params as provider options", () => {
      expect(forwarded({ chunking_strategy: "auto" }, "openai.transcription")).toEqual({
        openai: { chunkingStrategy: "auto" },
      });
    });
  });

  describe("toTranscriptionsUsage", () => {
    test("should map OpenAI token usage", () => {
      expect(
        toTranscriptionsUsage({
          type: "tokens",
          input_tokens: 14,
          output_tokens: 45,
          total_tokens: 59,
        }),
      ).toEqual({ input_tokens: 14, output_tokens: 45, total_tokens: 59, seconds: undefined });
    });

    test("should map OpenAI duration usage", () => {
      expect(toTranscriptionsUsage({ type: "duration", seconds: 3 }, 2.9)).toEqual({
        input_tokens: undefined,
        output_tokens: undefined,
        total_tokens: undefined,
        seconds: 3,
      });
    });

    test("should map Gemini usage metadata", () => {
      expect(toTranscriptionsUsage({ promptTokenCount: 10, candidatesTokenCount: 5 })).toEqual({
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        seconds: undefined,
      });
    });

    test("should fall back to the audio duration", () => {
      expect(toTranscriptionsUsage(undefined, 4.2)).toEqual({
        input_tokens: undefined,
        output_tokens: undefined,
        total_tokens: undefined,
        seconds: 4.2,
      });
    });
  });
});
