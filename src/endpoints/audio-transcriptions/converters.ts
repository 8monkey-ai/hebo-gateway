import type { JSONObject, TranscriptionModelV4CallOptions } from "@ai-sdk/provider";

import { GatewayError } from "../../errors/gateway";
import type { TranscriptionResult } from "../../middleware/transcription";
import { readJson, readRequestBody } from "../../utils/body";
import { toResponse } from "../../utils/response";
import { toAudioMediaType } from "../shared/converters";
import type { InputAudioFormat } from "../shared/schema";
import type {
  Transcriptions,
  TranscriptionsInputs,
  TranscriptionsResponseFormat,
  TranscriptionsUsage,
} from "./schema";

// Multipart fields that must stay strings (all other fields are JSON-coerced).
const STRING_FORM_FIELDS = new Set(["model", "language", "prompt", "response_format"]);

// Maps file extensions and media subtypes to `input_audio.format` values.
const AUDIO_FORMAT_ALIASES: Record<string, InputAudioFormat> = {
  aac: "x-aac",
  "x-aac": "x-aac",
  flac: "flac",
  "x-flac": "flac",
  mp3: "mp3",
  mpeg: "mpeg",
  mpga: "mpga",
  m4a: "m4a",
  "x-m4a": "m4a",
  mp4: "mp4",
  ogg: "ogg",
  oga: "ogg",
  pcm: "pcm",
  wav: "wav",
  wave: "wav",
  "x-wav": "wav",
  webm: "webm",
};

/**
 * Parse an `/audio/transcriptions` request into a `TranscriptionsBody`-shaped object.
 * Accepts OpenAI-style `multipart/form-data` (`file` upload) and OpenRouter-style JSON
 * (`input_audio: { data, format }`). `maxBodySize` applies to plain and compressed bodies.
 */
export async function parseTranscriptionsRequest(
  request: Request,
  maxBodySize: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  // Only the media type is case-insensitive: the multipart boundary is not.
  if (contentType.slice(0, 19).toLowerCase() === "multipart/form-data") {
    const form = await readRequestBody(
      request,
      maxBodySize,
      (body) => new Response(body, { headers: { "content-type": contentType } }).formData(),
      "Invalid multipart body",
    );
    return convertFormDataToTranscriptionsBody(form);
  }

  return readRequestBody(request, maxBodySize, readJson, "Invalid JSON");
}

export async function convertFormDataToTranscriptionsBody(
  form: FormData,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};

  for (const [rawKey, value] of form) {
    // Only `file` may carry binary data.
    if (typeof value !== "string") continue;

    // OpenAI SDKs send arrays as repeated `key[]` fields.
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    // Assigning `__proto__` would replace the body's prototype (JSON.parse keeps it inert).
    if (key === "__proto__") continue;
    const parsed = STRING_FORM_FIELDS.has(key) ? value : coerceFormValue(value);

    if (isArray) {
      const list = Array.isArray(body[key]) ? (body[key] as unknown[]) : (body[key] = []);
      list.push(parsed);
    } else {
      body[key] = parsed;
    }
  }

  const file = form.get("file");
  if (file !== null && typeof file !== "string") {
    body["input_audio"] = {
      data: new Uint8Array(await file.arrayBuffer()),
      format: toInputAudioFormat(file.name, file.type),
    };
  }

  return body;
}

// Multipart values are strings; recover numbers, booleans and JSON objects.
function coerceFormValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toInputAudioFormat(filename: string, mediaType: string): InputAudioFormat {
  const dot = filename.lastIndexOf(".");
  const extension = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
  const slash = mediaType.indexOf("/");
  const subtype =
    slash === -1
      ? ""
      : mediaType
          .slice(slash + 1)
          .split(";")[0]!
          .trim();

  const format = AUDIO_FORMAT_ALIASES[extension] ?? AUDIO_FORMAT_ALIASES[subtype.toLowerCase()];
  if (!format) {
    const name = filename.length > 100 ? `${filename.slice(0, 100)}…` : filename;
    throw new GatewayError(
      `Unsupported audio format for file '${name}'. Supported formats: ${[
        ...new Set(Object.values(AUDIO_FORMAT_ALIASES)),
      ].join(", ")}`,
      400,
    );
  }
  return format;
}

export type TranscriptionCallOptions = Omit<
  TranscriptionModelV4CallOptions,
  "audio" | "abortSignal" | "headers"
> & {
  audio: Uint8Array;
  providerOptions: Record<string, JSONObject>;
};

/**
 * Converts the OpenAI transcription params to AI SDK call options.
 * All params are passed as snake_case `unknown` provider options: model and provider
 * middleware map them to native options, and `forwardTranscriptionParams` camelizes them.
 */
export function convertToTranscriptionCallOptions(
  inputs: TranscriptionsInputs & Record<string, unknown>,
): TranscriptionCallOptions {
  const { input_audio, response_format: _responseFormat, stream: _stream, ...rest } = inputs;

  const unknown = rest as JSONObject;

  return {
    audio: input_audio.data,
    mediaType: toAudioMediaType(input_audio.format),
    // No params: no provider namespace, so providers keep their own defaults.
    providerOptions: Object.keys(unknown).length > 0 ? { unknown } : {},
  };
}

const toNumber = (value: unknown) => (typeof value === "number" ? value : undefined);

/**
 * Normalizes the provider-native usage object into a flat shape.
 * Handles OpenAI (`input_tokens` / `seconds`) and Gemini (`promptTokenCount`) usage,
 * and falls back to the audio duration when the provider reports no usage.
 */
export function toTranscriptionsUsage(
  usage?: JSONObject,
  durationInSeconds?: number,
): TranscriptionsUsage {
  const input = toNumber(usage?.["input_tokens"]) ?? toNumber(usage?.["promptTokenCount"]);
  const output = toNumber(usage?.["output_tokens"]) ?? toNumber(usage?.["candidatesTokenCount"]);
  const total =
    toNumber(usage?.["total_tokens"]) ??
    toNumber(usage?.["totalTokenCount"]) ??
    (input !== undefined && output !== undefined ? input + output : undefined);

  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    seconds: toNumber(usage?.["seconds"]) ?? durationInSeconds,
  };
}

export function toTranscriptions(
  result: TranscriptionResult,
  responseFormat: TranscriptionsResponseFormat = "json",
): Transcriptions {
  const transcriptions: Transcriptions = {
    text: result.text,
    usage: toTranscriptionsUsage(result.usage, result.durationInSeconds),
  };

  if (responseFormat === "verbose_json") {
    transcriptions.task = "transcribe";
    transcriptions.language = result.language;
    transcriptions.duration = result.durationInSeconds;
    transcriptions.segments = result.segments.map((segment, id) => ({
      id,
      start: segment.startSecond,
      end: segment.endSecond,
      text: segment.text,
    }));
    if (result.words) {
      transcriptions.words = result.words.map((word) => ({
        word: word.text,
        start: word.startSecond,
        end: word.endSecond,
      }));
    }
  }

  if (result.providerMetadata) transcriptions.provider_metadata = result.providerMetadata;

  return transcriptions;
}

export function createTranscriptionsResponse(
  result: TranscriptionResult,
  responseFormat?: TranscriptionsResponseFormat,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toTranscriptions(result, responseFormat), responseInit);
}
