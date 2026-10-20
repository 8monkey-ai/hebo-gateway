import { describe, expect, test } from "bun:test";

import type { TranscriptionModelV4CallOptions } from "@ai-sdk/provider";
import { MockProviderV4, MockTranscriptionModelV4 } from "ai/test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { audioTranscriptions } from "./handler";

const baseUrl = "http://localhost/audio/transcriptions";

const AUDIO = new Uint8Array([1, 2, 3, 4]);
const AUDIO_BASE64 = "AQIDBA==";

const errorMessage = async (res: Response) =>
  (await parseResponse<{ error: { message: string } }>(res))?.error.message;

const postForm = (fields: Record<string, string | string[] | File>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) form.append(key, v);
    else form.append(key, value);
  }
  return new Request(baseUrl, { method: "POST", body: form });
};

describe("Audio Transcriptions Handler", () => {
  const calls: TranscriptionModelV4CallOptions[] = [];

  const transcriber = new MockTranscriptionModelV4({
    provider: "openai.transcription",
    modelId: "transcribe-1",
    doGenerate: (options) => {
      calls.push(options);
      return Promise.resolve({
        text: "hello world",
        segments: [
          { text: "hello", startSecond: 0, endSecond: 0.5 },
          { text: "world", startSecond: 0.5, endSecond: 1 },
        ],
        language: "en",
        durationInSeconds: 1.2,
        warnings: [],
        usage: { type: "duration", seconds: 2 },
        response: { timestamp: new Date(0), modelId: "transcribe-1" },
      });
    },
  });

  const grok = new MockTranscriptionModelV4({
    provider: "xai.transcription",
    modelId: "grok-voice-transcribe-2.0",
    doGenerate: (options) => {
      calls.push(options);
      return Promise.resolve({
        text: "hola",
        segments: [],
        language: "es",
        durationInSeconds: 0.8,
        warnings: [],
        response: { timestamp: new Date(0), modelId: "grok-voice-transcribe-2.0" },
      });
    },
  });

  const endpoint = audioTranscriptions({
    providers: {
      openai: new MockProviderV4({ transcriptionModels: { "transcribe-1": transcriber } }),
      xai: new MockProviderV4({ transcriptionModels: { "grok-voice-transcribe-2.0": grok } }),
    },
    models: {
      "transcribe-1": {
        name: "Transcribe",
        modalities: { input: ["audio"], output: ["transcription"] },
        providers: ["openai"],
      },
      "grok-voice-transcribe-2.0": {
        name: "Grok Voice Transcribe",
        modalities: { input: ["audio"], output: ["transcription"] },
        providers: ["xai"],
      },
      "gpt-oss-20b": {
        name: "GPT-OSS 20B",
        modalities: { input: ["text"], output: ["text"] },
        providers: ["openai"],
      },
      "text-embedding-3-small": {
        name: "OpenAI Embedding Model",
        modalities: { input: ["text"], output: ["embeddings"] },
        providers: ["openai"],
      },
    },
    advanced: { maxBodySize: 1024 },
  });

  test("should transcribe a multipart file upload", async () => {
    calls.length = 0;
    const res = await endpoint.handler(
      postForm({
        model: "transcribe-1",
        file: new File([AUDIO], "speech.mp3", { type: "audio/mpeg" }),
        language: "en",
        prompt: "Greeting",
        temperature: "0.2",
        "timestamp_granularities[]": ["word", "segment"],
      }),
    );

    expect(res.status).toBe(200);
    expect(await parseResponse(res)).toEqual({
      text: "hello world",
      usage: { seconds: 2 },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.audio).toEqual(AUDIO);
    expect(calls[0]!.mediaType).toBe("audio/mpeg");
    expect(calls[0]!.providerOptions).toEqual({
      openai: {
        language: "en",
        prompt: "Greeting",
        temperature: 0.2,
        timestampGranularities: ["word", "segment"],
      },
    });
  });

  test("should transcribe OpenRouter-style base64 input_audio", async () => {
    calls.length = 0;
    const res = await endpoint.handler(
      postJson(baseUrl, {
        model: "transcribe-1",
        input_audio: { data: AUDIO_BASE64, format: "wav" },
      }),
    );

    expect(await parseResponse(res)).toEqual({
      text: "hello world",
      usage: { seconds: 2 },
    });
    expect(calls[0]!.audio).toEqual(AUDIO);
    expect(calls[0]!.mediaType).toBe("audio/wav");
    // No params: no provider namespace, so providers keep their own defaults.
    expect(calls[0]!.providerOptions).toEqual({});
  });

  test("should return verbose_json from normalized segments", async () => {
    const res = await endpoint.handler(
      postJson(baseUrl, {
        model: "transcribe-1",
        input_audio: { data: AUDIO_BASE64, format: "mp3" },
        response_format: "verbose_json",
      }),
    );

    expect(await parseResponse(res)).toEqual({
      text: "hello world",
      task: "transcribe",
      language: "en",
      duration: 1.2,
      segments: [
        { id: 0, start: 0, end: 0.5, text: "hello" },
        { id: 1, start: 0.5, end: 1, text: "world" },
      ],
      usage: { seconds: 2 },
    });
  });

  test("should forward provider-specific params and fall back to duration usage", async () => {
    calls.length = 0;
    const res = await endpoint.handler(
      postForm({
        model: "grok-voice-transcribe-2.0",
        file: new File([AUDIO], "speech.ogg"),
        language: "es",
        diarize: "true",
      }),
    );

    expect(await parseResponse(res)).toEqual({ text: "hola", usage: { seconds: 0.8 } });
    expect(calls[0]!.mediaType).toBe("audio/ogg");
    expect(calls[0]!.providerOptions).toEqual({ xai: { diarize: true, language: "es" } });
  });

  test.each(["text", "srt", "vtt"])("should reject response_format '%s'", async (format) => {
    const res = await endpoint.handler(
      postJson(baseUrl, {
        model: "transcribe-1",
        input_audio: { data: AUDIO_BASE64, format: "mp3" },
        response_format: format,
      }),
    );

    expect(res.status).toBe(400);
  });

  test("should reject streaming", async () => {
    const res = await endpoint.handler(
      postForm({
        model: "transcribe-1",
        file: new File([AUDIO], "speech.mp3"),
        stream: "true",
      }),
    );

    expect(res.status).toBe(400);
    expect(await errorMessage(res)).toContain("Streaming transcription is not supported");
  });

  test("should reject unsupported audio files", async () => {
    const res = await endpoint.handler(
      postForm({
        model: "transcribe-1",
        file: new File([AUDIO], "speech.txt", { type: "text/plain" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await errorMessage(res)).toContain("Unsupported audio format");
  });

  test("should return 400 if input_audio is missing", async () => {
    const res = await endpoint.handler(postForm({ model: "transcribe-1" }));

    expect(res.status).toBe(400);
    expect(await errorMessage(res)).toContain("input_audio");
  });

  test("should enforce maxBodySize on uncompressed bodies", async () => {
    const res = await endpoint.handler(
      postForm({
        model: "transcribe-1",
        file: new File([new Uint8Array(2048)], "speech.mp3"),
      }),
    );

    expect(res.status).toBe(413);
  });

  test("should return 422 for chat models", async () => {
    const res = await endpoint.handler(
      postJson(baseUrl, {
        model: "gpt-oss-20b",
        input_audio: { data: AUDIO_BASE64, format: "mp3" },
      }),
    );

    expect(await parseResponse(res)).toMatchObject({
      error: {
        code: "model_unsupported_operation",
        message: "Model 'gpt-oss-20b' does not support 'transcription' output",
      },
    });
  });

  test("should return 422 for embedding models", async () => {
    const res = await endpoint.handler(
      postJson(baseUrl, {
        model: "text-embedding-3-small",
        input_audio: { data: AUDIO_BASE64, format: "mp3" },
      }),
    );

    expect(await parseResponse(res)).toMatchObject({
      error: { code: "model_unsupported_operation" },
    });
  });

  test("should run before and after hooks", async () => {
    calls.length = 0;
    const hooked = audioTranscriptions({
      providers: {
        openai: new MockProviderV4({ transcriptionModels: { "transcribe-1": transcriber } }),
      },
      models: {
        "transcribe-1": {
          modalities: { input: ["audio"], output: ["transcription"] },
          providers: ["openai"],
        },
      },
      hooks: {
        before: (ctx) => {
          expect(ctx.operation).toBe("transcriptions");
          const body = ctx.body as { input_audio: { data: unknown } };
          expect(body.input_audio.data).toBeInstanceOf(Uint8Array);
          return { ...ctx.body, language: "fr" };
        },
        after: (ctx) => ({ ...(ctx.result as { text: string }), text: "patched", usage: {} }),
      },
    });

    const res = await hooked.handler(
      postJson(baseUrl, {
        model: "transcribe-1",
        input_audio: { data: AUDIO_BASE64, format: "mp3" },
      }),
    );

    expect(await parseResponse(res)).toEqual({ text: "patched", usage: {} });
    expect(calls[0]!.providerOptions).toEqual({ openai: { language: "fr" } });
  });

  test("should return 'Method Not Allowed' for GET request", async () => {
    const res = await endpoint.handler(new Request(baseUrl, { method: "GET" }));

    expect(await parseResponse(res)).toMatchObject({
      error: { code: "method_not_allowed" },
    });
  });
});
