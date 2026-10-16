import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import OpenAI, { APIError, toFile } from "openai";

import type { ModelCatalog, ProviderRegistry } from "../../../src";
import { chirp3, gemini35Transcribe } from "../../../src/models/google";
import { gpt4oMiniTranscribe, whisper1, whisperLargeV3Turbo } from "../../../src/models/openai";
import { grokVoiceTranscribe20 } from "../../../src/models/xai";
import { withCanonicalIdsForGroq } from "../../../src/providers/groq";
import { withCanonicalIdsForOpenAI } from "../../../src/providers/openai";
import { withCanonicalIdsForVertex } from "../../../src/providers/vertex";
import { withCanonicalIdsForXai } from "../../../src/providers/xai";
import { GOOGLE_VERTEX_PROJECT, createTestServer, type TestServer } from "../shared/server";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
const GROQ_API_KEY = process.env["GROQ_API_KEY"];
const XAI_API_KEY = process.env["XAI_API_KEY"];
// Vertex transcription rejects Express Mode API keys, so it needs Google Cloud credentials.
const hasVertexCredentials = !!(
  GOOGLE_VERTEX_PROJECT &&
  (process.env["GOOGLE_APPLICATION_CREDENTIALS"] ?? process.env["GOOGLE_CLIENT_EMAIL"])
);
// Chirp 3 and Gemini 3.5 Transcribe are served from the `us` multi-region.
const VERTEX_TRANSCRIPTION_LOCATION = process.env["GOOGLE_VERTEX_TRANSCRIPTION_LOCATION"] ?? "us";

const SPEECH = new Uint8Array(
  await Bun.file(new URL("../fixtures/speech.mp3", import.meta.url)).arrayBuffer(),
);
const SPEECH_BASE64 = Buffer.from(SPEECH).toString("base64");

type TranscriptionUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  seconds?: number;
};

type VerboseTranscription = {
  text: string;
  task: string;
  language?: string;
  duration?: number;
  segments: { id: number; start: number; end: number; text: string }[];
  usage: TranscriptionUsage;
};

// ---------------------------------------------------------------------------
// Shared suite
// ---------------------------------------------------------------------------

type SuiteOptions = {
  name: string;
  enabled: boolean;
  providers: () => ProviderRegistry;
  catalog: () => ModelCatalog;
  model: string;
  /** Which usage field the provider reports. */
  usage: "tokens" | "seconds";
  /** Whether the provider returns timestamped segments. */
  segments: boolean;
};

function describeTranscriptions(options: SuiteOptions) {
  describe.skipIf(!options.enabled)(`Audio Transcriptions E2E (${options.name})`, () => {
    let testServer: TestServer;
    let client: OpenAI;

    const expectUsage = (usage: TranscriptionUsage | undefined) => {
      expect(usage).toBeDefined();
      if (options.usage === "tokens") {
        expect(usage!.input_tokens).toBeGreaterThan(0);
        expect(usage!.output_tokens).toBeGreaterThan(0);
      } else {
        expect(usage!.seconds).toBeGreaterThan(0);
      }
    };

    beforeAll(() => {
      testServer = createTestServer(options.providers(), options.catalog());
      client = new OpenAI({ apiKey: "not-needed", baseURL: `${testServer.baseUrl}/v1` });
    });

    afterAll(async () => {
      await testServer?.server?.stop(true);
    });

    test(
      "multipart: transcribes an uploaded file",
      async () => {
        const transcription = await client.audio.transcriptions.create({
          model: options.model,
          file: await toFile(SPEECH, "speech.mp3", { type: "audio/mpeg" }),
        });

        expect(transcription.text.trim().length).toBeGreaterThan(0);
        expectUsage(transcription.usage);
      },
      { timeout: 60_000 },
    );

    test(
      "multipart: returns verbose_json",
      async () => {
        const transcription = (await client.audio.transcriptions.create({
          model: options.model,
          file: await toFile(SPEECH, "speech.mp3", { type: "audio/mpeg" }),
          response_format: "verbose_json",
        })) as unknown as VerboseTranscription;

        expect(transcription.task).toBe("transcribe");
        expect(transcription.text.trim().length).toBeGreaterThan(0);
        expect(Array.isArray(transcription.segments)).toBe(true);
        if (options.segments) {
          expect(transcription.segments.length).toBeGreaterThan(0);
          const [first] = transcription.segments;
          expect(first!.end).toBeGreaterThanOrEqual(first!.start);
        }
      },
      { timeout: 60_000 },
    );

    test(
      "json: transcribes base64 input_audio",
      async () => {
        const res = await fetch(`${testServer.baseUrl}/v1/audio/transcriptions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: options.model,
            input_audio: { data: SPEECH_BASE64, format: "mp3" },
          }),
        });

        expect(res.status).toBe(200);
        const transcription = (await res.json()) as { text: string; usage: TranscriptionUsage };
        expect(transcription.text.trim().length).toBeGreaterThan(0);
        expectUsage(transcription.usage);
      },
      { timeout: 60_000 },
    );

    test(
      "error: rejects unsupported response formats",
      async () => {
        try {
          await client.audio.transcriptions.create({
            model: options.model,
            file: await toFile(SPEECH, "speech.mp3", { type: "audio/mpeg" }),
            response_format: "srt",
          });
          expect.unreachable("should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(APIError);
          expect((error as APIError).status).toBe(400);
        }
      },
      { timeout: 60_000 },
    );
  });
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const openaiProviders = () => ({
  openai: withCanonicalIdsForOpenAI(createOpenAI({ apiKey: OPENAI_API_KEY })),
});

describeTranscriptions({
  name: "OpenAI - whisper-1",
  enabled: !!OPENAI_API_KEY,
  providers: openaiProviders,
  catalog: () => whisper1({ providers: ["openai"] }),
  model: "openai/whisper-1",
  usage: "seconds",
  segments: true,
});

describeTranscriptions({
  name: "OpenAI - gpt-4o-mini-transcribe",
  enabled: !!OPENAI_API_KEY,
  providers: openaiProviders,
  catalog: () => gpt4oMiniTranscribe({ providers: ["openai"] }),
  model: "openai/gpt-4o-mini-transcribe",
  usage: "tokens",
  segments: false,
});

describeTranscriptions({
  name: "Groq - whisper-large-v3-turbo",
  enabled: !!GROQ_API_KEY,
  providers: () => ({ groq: withCanonicalIdsForGroq(createGroq({ apiKey: GROQ_API_KEY })) }),
  catalog: () => whisperLargeV3Turbo(),
  model: "openai/whisper-large-v3-turbo",
  usage: "seconds",
  segments: true,
});

describeTranscriptions({
  name: "xAI - grok-voice-transcribe-2.0",
  enabled: !!XAI_API_KEY,
  providers: () => ({ xai: withCanonicalIdsForXai(createXai({ apiKey: XAI_API_KEY })) }),
  catalog: () => grokVoiceTranscribe20(),
  model: "xai/grok-voice-transcribe-2.0",
  usage: "seconds",
  segments: true,
});

const vertexProviders = () => ({
  vertex: withCanonicalIdsForVertex(
    createVertex({ project: GOOGLE_VERTEX_PROJECT!, location: VERTEX_TRANSCRIPTION_LOCATION }),
  ),
});

describeTranscriptions({
  name: "Vertex - chirp-3",
  enabled: hasVertexCredentials,
  providers: vertexProviders,
  catalog: () => chirp3(),
  model: "google/chirp-3",
  usage: "seconds",
  segments: true,
});

describeTranscriptions({
  name: "Vertex - gemini-3.5-transcribe",
  enabled: hasVertexCredentials,
  providers: vertexProviders,
  catalog: () => gemini35Transcribe(),
  model: "google/gemini-3.5-transcribe",
  usage: "tokens",
  segments: false,
});
