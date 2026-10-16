import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createAzure } from "@ai-sdk/azure";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import OpenAI, { APIError, toFile } from "openai";

import type { ModelCatalog, ProviderRegistry } from "../../../src";
import { gemini35Transcribe } from "../../../src/models/google";
import { maiTranscribe2 } from "../../../src/models/microsoft";
import { gptTranscribe } from "../../../src/models/openai";
import { grokVoiceTranscribe20 } from "../../../src/models/xai";
import { withCanonicalIdsForAzure } from "../../../src/providers/azure";
import { withCanonicalIdsForOpenAI } from "../../../src/providers/openai";
import { withCanonicalIdsForVertex } from "../../../src/providers/vertex";
import { withCanonicalIdsForXai } from "../../../src/providers/xai";
import { GOOGLE_VERTEX_PROJECT, createTestServer, type TestServer } from "../shared/server";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env["OPENAI_API_KEY"];
const XAI_API_KEY = process.env["XAI_API_KEY"];
// MAI-Transcribe uses the Azure Speech API of a Foundry resource in a supported region.
const AZURE_RESOURCE_NAME = process.env["AZURE_RESOURCE_NAME"];
const AZURE_API_KEY = process.env["AZURE_API_KEY"];
// Vertex transcription rejects Express Mode API keys, so it needs Google Cloud credentials.
const hasVertexCredentials = !!(
  GOOGLE_VERTEX_PROJECT &&
  (process.env["GOOGLE_APPLICATION_CREDENTIALS"] ?? process.env["GOOGLE_CLIENT_EMAIL"])
);
// Gemini 3.5 Transcribe is served from the `us` multi-region.
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
  words?: { word: string; start: number; end: number }[];
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
  /** Whether the provider returns word timings by default. */
  words?: boolean;
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
        if (options.words) {
          expect(transcription.words!.length).toBeGreaterThan(0);
          expect(transcription.words![0]!.word.trim()).not.toContain(" ");
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

describeTranscriptions({
  name: "OpenAI - gpt-transcribe",
  enabled: !!OPENAI_API_KEY,
  providers: () => ({
    openai: withCanonicalIdsForOpenAI(createOpenAI({ apiKey: OPENAI_API_KEY })),
  }),
  catalog: () => gptTranscribe({ providers: ["openai"] }),
  model: "openai/gpt-transcribe",
  usage: "seconds",
  segments: false,
});

describeTranscriptions({
  name: "Azure - mai-transcribe-2",
  enabled: !!(AZURE_RESOURCE_NAME && AZURE_API_KEY),
  providers: () => ({
    azure: withCanonicalIdsForAzure(
      createAzure({ resourceName: AZURE_RESOURCE_NAME, apiKey: AZURE_API_KEY }),
    ),
  }),
  catalog: () => maiTranscribe2(),
  model: "microsoft/mai-transcribe-2",
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
  // xAI only returns word timings, so they go to `words`.
  segments: false,
  words: true,
});

const vertexProviders = () => ({
  vertex: withCanonicalIdsForVertex(
    createVertex({ project: GOOGLE_VERTEX_PROJECT!, location: VERTEX_TRANSCRIPTION_LOCATION }),
  ),
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
