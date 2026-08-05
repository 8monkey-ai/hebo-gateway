import { describe, expect, test } from "bun:test";

import type { LanguageModelV4CallOptions, LanguageModelV4FilePart } from "@ai-sdk/provider";
import { MockLanguageModelV4, MockProviderV4 } from "ai/test";

import { postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { chatCompletions } from "../chat-completions/handler";
import { messages } from "../messages/handler";
import { responses } from "../responses/handler";

/**
 * v7 unified the deprecated `ImagePart` into `FilePart`, so images and non-image
 * files now travel through the same prompt part. These tests capture the
 * `LanguageModelV4` prompt the provider actually receives and assert that every
 * input media type still arrives as a `file` part with the expected
 * `mediaType`, `filename`, and data shape.
 */

// 1x1 red pixel PNG. Note that the AI SDK sniffs byte signatures and overrides
// `mediaType` when it recognizes one, so tests for other media types must use
// payloads without a detectable signature.
const RED_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
// "hello" — a signature-free payload standing in for arbitrary content.
const HELLO_BASE64 = "aGVsbG8=";
const HELLO_BYTES = [104, 101, 108, 108, 111];

const MODEL_ID = "openai/gpt-oss-20b";
const REMOTE_URL = "https://example.com/photo";

const models = defineModelCatalog({
  [MODEL_ID]: {
    name: "GPT-OSS 20B",
    modalities: { input: ["text", "image", "file"], output: ["text"] },
    providers: ["groq"],
  },
});

/**
 * Builds an endpoint whose provider records the prompt it was called with, so
 * assertions run against the real converted prompt rather than a re-implementation.
 */
function createRecordingEndpoint(factory: typeof chatCompletions) {
  const calls: LanguageModelV4CallOptions[] = [];

  const model = new MockLanguageModelV4({
    // Declaring remote image URLs as supported keeps the SDK from downloading
    // them, which is also what the real OpenAI/Anthropic models advertise.
    supportedUrls: { "image/*": [/^https?:\/\/.*$/u] },
    doGenerate: (options) => {
      calls.push(options);
      return Promise.resolve({
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 5, text: 5, reasoning: 0 },
        },
        content: [{ type: "text" as const, text: "ok" }],
        warnings: [],
      });
    },
  });

  const endpoint = factory({
    providers: { groq: new MockProviderV4({ languageModels: { [MODEL_ID]: model } }) },
    models,
  });

  /** Sends `body` and returns the file parts of the first user message. */
  const fileParts = async (url: string, body: unknown): Promise<LanguageModelV4FilePart[]> => {
    const res = await endpoint.handler(postJson(url, body));
    expect(res.status).toBe(200);

    const user = calls.at(-1)!.prompt.find((m) => m.role === "user")!;
    return (user.content as LanguageModelV4FilePart[]).filter((p) => p.type === "file");
  };

  const rawPost = (url: string, body: unknown) => endpoint.handler(postJson(url, body));

  return { fileParts, rawPost };
}

describe("FilePart conversion (v7 image/file unification)", () => {
  describe("/chat/completions", () => {
    const url = "http://localhost/chat/completions";

    test.each([
      ["image/png", RED_PIXEL_PNG],
      ["image/jpeg", HELLO_BASE64],
      ["image/webp", HELLO_BASE64],
      ["image/gif", HELLO_BASE64],
    ])("image_url data URL keeps the %s media type", async (mediaType, data) => {
      const { fileParts } = createRecordingEndpoint(chatCompletions);
      const parts = await fileParts(url, {
        model: MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${data}` } },
            ],
          },
        ],
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe(mediaType);
      expect(parts[0]!.data.type).toBe("data");
    });

    test("image_url remote URL is forwarded as a URL with a top-level image media type", async () => {
      const { fileParts } = createRecordingEndpoint(chatCompletions);
      const parts = await fileParts(url, {
        model: MODEL_ID,
        messages: [
          { role: "user", content: [{ type: "image_url", image_url: { url: REMOTE_URL } }] },
        ],
      });

      expect(parts).toHaveLength(1);
      // The concrete subtype is unknown for remote URLs, so the gateway sends the
      // bare top-level segment. `LanguageModelV4FilePart` allows this, and it
      // still matches an `image/*` entry in a model's `supportedUrls`.
      expect(parts[0]!.mediaType).toBe("image");
      expect(parts[0]!.data).toMatchObject({ type: "url" });
    });

    test.each([
      ["application/pdf", "report.pdf"],
      ["text/plain", "notes.txt"],
      ["text/csv", "rows.csv"],
    ])("file part keeps the %s media type and filename", async (mediaType, filename) => {
      const { fileParts } = createRecordingEndpoint(chatCompletions);
      const parts = await fileParts(url, {
        model: MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { type: "file", file: { data: HELLO_BASE64, media_type: mediaType, filename } },
            ],
          },
        ],
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe(mediaType);
      expect(parts[0]!.filename).toBe(filename);
      expect(parts[0]!.data).toMatchObject({ type: "data" });
    });

    test("input_audio is converted to an audio file part", async () => {
      const { fileParts } = createRecordingEndpoint(chatCompletions);
      const parts = await fileParts(url, {
        model: MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: HELLO_BASE64, format: "wav" } }],
          },
        ],
      });

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe("audio/wav");
    });

    test("images and non-image files coexist in one message and keep their order", async () => {
      const { fileParts } = createRecordingEndpoint(chatCompletions);
      const parts = await fileParts(url, {
        model: MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Compare these." },
              { type: "image_url", image_url: { url: `data:image/png;base64,${RED_PIXEL_PNG}` } },
              {
                type: "file",
                file: { data: HELLO_BASE64, media_type: "application/pdf", filename: "a.pdf" },
              },
            ],
          },
        ],
      });

      expect(parts.map((p) => p.mediaType)).toEqual(["image/png", "application/pdf"]);
    });

    test("base64 image data is decoded to bytes rather than forwarded as a string", async () => {
      const { fileParts } = createRecordingEndpoint(chatCompletions);
      const parts = await fileParts(url, {
        model: MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${HELLO_BASE64}` } },
            ],
          },
        ],
      });

      const data = parts[0]!.data as { type: "data"; data: Uint8Array | string };
      expect(data.type).toBe("data");
      expect(data.data).toBeInstanceOf(Uint8Array);
      expect([...(data.data as Uint8Array)]).toEqual(HELLO_BYTES);
    });
  });

  describe("/messages", () => {
    const url = "http://localhost/messages";
    const send = (content: unknown) => ({
      model: MODEL_ID,
      max_tokens: 64,
      messages: [{ role: "user", content }],
    });

    test.each([
      ["image/png", RED_PIXEL_PNG],
      ["image/jpeg", HELLO_BASE64],
      ["image/webp", HELLO_BASE64],
    ])("base64 image block keeps the %s media type", async (mediaType, data) => {
      const { fileParts } = createRecordingEndpoint(messages as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([{ type: "image", source: { type: "base64", media_type: mediaType, data } }]),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe(mediaType);
      expect(parts[0]!.data).toMatchObject({ type: "data" });
    });

    test("URL image block falls back to the top-level image media type", async () => {
      const { fileParts } = createRecordingEndpoint(messages as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([{ type: "image", source: { type: "url", url: REMOTE_URL } }]),
      );

      expect(parts[0]!.mediaType).toBe("image");
      expect(parts[0]!.data).toMatchObject({ type: "url" });
    });

    test("base64 document block keeps its non-image media type", async () => {
      const { fileParts } = createRecordingEndpoint(messages as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: HELLO_BASE64 },
          },
        ]),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe("application/pdf");
    });

    test("image and document blocks coexist and keep their order", async () => {
      const { fileParts } = createRecordingEndpoint(messages as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([
          { type: "text", text: "Compare these." },
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: RED_PIXEL_PNG },
          },
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: HELLO_BASE64 },
          },
        ]),
      );

      expect(parts.map((p) => p.mediaType)).toEqual(["image/png", "application/pdf"]);
    });
  });

  describe("/responses", () => {
    const url = "http://localhost/responses";
    const send = (content: unknown) => ({
      model: MODEL_ID,
      input: [{ type: "message", role: "user", content }],
    });

    test.each([
      ["image/png", RED_PIXEL_PNG],
      ["image/gif", HELLO_BASE64],
    ])("input_image data URL keeps the %s media type", async (mediaType, data) => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([{ type: "input_image", image_url: `data:${mediaType};base64,${data}` }]),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe(mediaType);
    });

    test("input_image remote URL falls back to the top-level image media type", async () => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(url, send([{ type: "input_image", image_url: REMOTE_URL }]));

      expect(parts[0]!.mediaType).toBe("image");
      expect(parts[0]!.data).toMatchObject({ type: "url" });
    });

    test("input_image file_id is forwarded as a file part, not a deprecated image part", async () => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(url, send([{ type: "input_image", file_id: "file_abc123" }]));

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe("image");
    });

    test("input_file keeps its non-image media type and filename", async () => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([{ type: "input_file", file_data: HELLO_BASE64, filename: "report.pdf" }]),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]!.filename).toBe("report.pdf");
      expect(parts[0]!.data).toMatchObject({ type: "data" });
    });

    // OpenAI clients send input_file.file_data as a data URL. Passing that
    // straight to a base64 decoder both throws and loses the media type.
    test.each([
      ["application/pdf", HELLO_BASE64],
      ["text/plain", HELLO_BASE64],
      ["text/csv", HELLO_BASE64],
      ["audio/wav", HELLO_BASE64],
      ["image/png", RED_PIXEL_PNG],
    ])("input_file data URL keeps the %s media type", async (mediaType, data) => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([
          {
            type: "input_file",
            file_data: `data:${mediaType};base64,${data}`,
            filename: "doc",
          },
        ]),
      );

      expect(parts).toHaveLength(1);
      expect(parts[0]!.mediaType).toBe(mediaType);
      expect(parts[0]!.filename).toBe("doc");
      expect(parts[0]!.data).toMatchObject({ type: "data" });
    });

    test("input_file data URL decodes to the underlying bytes", async () => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([{ type: "input_file", file_data: `data:text/plain;base64,${HELLO_BASE64}` }]),
      );

      const data = parts[0]!.data as { type: "data"; data: Uint8Array };
      expect([...data.data]).toEqual(HELLO_BYTES);
    });

    test("input_file bare base64 still falls back to a generic binary media type", async () => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(url, send([{ type: "input_file", file_data: HELLO_BASE64 }]));

      expect(parts[0]!.mediaType).toBe("application/octet-stream");
      const data = parts[0]!.data as { type: "data"; data: Uint8Array };
      expect([...data.data]).toEqual(HELLO_BYTES);
    });

    test("input_file malformed data URL returns a 400", async () => {
      const { rawPost } = createRecordingEndpoint(responses as typeof chatCompletions);
      const res = await rawPost(url, send([{ type: "input_file", file_data: "data:,notbase64" }]));

      expect(res.status).toBe(400);
    });

    test("input_image and input_file coexist and keep their order", async () => {
      const { fileParts } = createRecordingEndpoint(responses as typeof chatCompletions);
      const parts = await fileParts(
        url,
        send([
          { type: "input_text", text: "Compare these." },
          { type: "input_image", image_url: `data:image/png;base64,${RED_PIXEL_PNG}` },
          { type: "input_file", file_data: HELLO_BASE64, filename: "a.pdf" },
        ]),
      );

      expect(parts.map((p) => p.mediaType)).toEqual(["image/png", "application/octet-stream"]);
    });
  });
});
