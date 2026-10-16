import type {
  JSONObject,
  TranscriptionModelV4CallOptions,
  TranscriptionModelV4Result,
} from "@ai-sdk/provider";

import { GatewayError } from "../../errors/gateway";
import { extractProviderNamespace, isMaiTranscribeModel } from "../../middleware/common";
import { readJson, readRequestBody } from "../../utils/body";
import { toResponse } from "../../utils/response";
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

const unsupportedParam = (param: string, provider: string) =>
  new GatewayError(`Parameter '${param}' is not supported by provider '${provider}'`, 400);

const unsupportedModelParam = (param: string, modelId: string) =>
  new GatewayError(`Parameter '${param}' is not supported by model '${modelId}'`, 400);

/**
 * Maps the OpenAI transcription params to the native options of each provider.
 * Keys are snake_case: `forwardTranscriptionParams` camelizes them.
 */
function toProviderParams(
  inputs: Pick<
    TranscriptionsInputs,
    "language" | "prompt" | "temperature" | "timestamp_granularities"
  >,
  namespace: string,
  modelId: string,
): Record<string, unknown> {
  const { language, prompt, temperature, timestamp_granularities } = inputs;
  const out: Record<string, unknown> = {};

  const api = namespace === "azure" && isMaiTranscribeModel(modelId) ? "azure-speech" : namespace;
  switch (api) {
    case "xai":
      if (prompt !== undefined) throw unsupportedParam("prompt", namespace);
      if (temperature !== undefined) throw unsupportedParam("temperature", namespace);
      // xAI always returns word timestamps, so `timestamp_granularities` needs no mapping.
      if (language !== undefined) out["language"] = language;
      return out;

    case "vertex":
      if (prompt !== undefined) throw unsupportedParam("prompt", namespace);
      if (temperature !== undefined) throw unsupportedParam("temperature", namespace);
      if (language !== undefined) out["language_codes"] = [language];
      // Chirp always enables word offsets (its segments are built from them), so only
      // Gemini Transcribe needs an explicit toggle.
      if (modelId.startsWith("gemini") && timestamp_granularities?.includes("word")) {
        out["word_timestamp"] = true;
      }
      return out;

    // MAI-Transcribe runs on the Azure Speech API; other Azure deployments are Azure OpenAI.
    case "azure-speech":
      if (prompt !== undefined) throw unsupportedModelParam("prompt", modelId);
      if (temperature !== undefined) throw unsupportedModelParam("temperature", modelId);
      if (language !== undefined) out["locales"] = [language];
      if (timestamp_granularities !== undefined) {
        out["timestamps"] = timestamp_granularities.includes("word") ? "word" : "segment";
      }
      return out;

    default:
      if (language !== undefined) out["language"] = language;
      if (prompt !== undefined) out["prompt"] = prompt;
      if (temperature !== undefined) out["temperature"] = temperature;
      if (modelId.startsWith("gpt-transcribe")) {
        if (timestamp_granularities !== undefined) {
          throw unsupportedModelParam("timestamp_granularities", modelId);
        }
        // GPT Transcribe only returns `json`. Without these, the AI SDK sends `verbose_json`
        // and `timestamp_granularities[]=segment` as soon as any OpenAI option is set.
        out["response_format"] = "json";
        out["timestamp_granularities"] = [];
        return out;
      }
      if (timestamp_granularities !== undefined) {
        out["timestamp_granularities"] = timestamp_granularities;
      }
      // Groq only returns segments and duration with `verbose_json`.
      if (namespace === "groq") out["response_format"] = "verbose_json";
      return out;
  }
}

export function convertToTranscriptionCallOptions(
  inputs: TranscriptionsInputs & Record<string, unknown>,
  provider: string,
  modelId: string,
): TranscriptionCallOptions {
  const {
    input_audio,
    language,
    prompt,
    temperature,
    timestamp_granularities,
    response_format: _responseFormat,
    stream: _stream,
    ...rest
  } = inputs;

  const params = toProviderParams(
    { language, prompt, temperature, timestamp_granularities },
    extractProviderNamespace(provider),
    modelId,
  );

  // Remaining body params (e.g. `diarize`, `chunking_strategy`) are provider-specific.
  const unknown = { ...rest, ...params } as JSONObject;

  return {
    audio: input_audio.data,
    mediaType: `audio/${input_audio.format}`,
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
  result: TranscriptionModelV4Result,
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
  }

  if (result.providerMetadata) transcriptions.provider_metadata = result.providerMetadata;

  return transcriptions;
}

export function createTranscriptionsResponse(
  result: TranscriptionModelV4Result,
  responseFormat?: TranscriptionsResponseFormat,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toTranscriptions(result, responseFormat), responseInit);
}
