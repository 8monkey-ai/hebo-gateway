import * as z from "zod";

import { parseBase64 } from "../shared/converters";
import { InputAudioFormatSchema, TraceSchema } from "../shared/schema";

// `text`, `srt` and `vtt` are not supported: the AI SDK only returns normalized JSON.
export const TranscriptionsResponseFormatSchema = z.enum(["json", "verbose_json"]);
export type TranscriptionsResponseFormat = z.infer<typeof TranscriptionsResponseFormatSchema>;

export const TranscriptionsTimestampGranularitySchema = z.enum(["word", "segment"]);
export type TranscriptionsTimestampGranularity = z.infer<
  typeof TranscriptionsTimestampGranularitySchema
>;

/**
 * Audio input, shaped like OpenRouter's `input_audio`.
 * JSON requests send base64 `data`; multipart uploads are converted to raw bytes
 * before validation. Either way, `data` is a `Uint8Array` after parsing.
 */
export const TranscriptionsInputAudioSchema = z.object({
  data: z.union([z.instanceof(Uint8Array), z.string().transform((data) => parseBase64(data))]),
  format: InputAudioFormatSchema,
});
export type TranscriptionsInputAudio = z.infer<typeof TranscriptionsInputAudioSchema>;

export const TranscriptionsInputsSchema = z.object({
  input_audio: TranscriptionsInputAudioSchema,
  language: z.string().optional(),
  prompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  response_format: TranscriptionsResponseFormatSchema.optional(),
  timestamp_granularities: z.array(TranscriptionsTimestampGranularitySchema).optional(),
  stream: z.literal(false, { error: "Streaming transcription is not supported" }).optional(),
});
export type TranscriptionsInputs = z.infer<typeof TranscriptionsInputsSchema>;

export const TranscriptionsBodySchema = z.looseObject({
  model: z.string(),
  trace: TraceSchema,
  ...TranscriptionsInputsSchema.shape,
});
export type TranscriptionsBody = z.infer<typeof TranscriptionsBodySchema>;

export const TranscriptionsSegmentSchema = z.object({
  id: z.int().nonnegative(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
});
export type TranscriptionsSegment = z.infer<typeof TranscriptionsSegmentSchema>;

// Flat usage shape (OpenRouter-style): fields are filled in when the provider reports them.
export const TranscriptionsUsageSchema = z.object({
  input_tokens: z.int().nonnegative().optional(),
  output_tokens: z.int().nonnegative().optional(),
  total_tokens: z.int().nonnegative().optional(),
  seconds: z.number().nonnegative().optional(),
});
export type TranscriptionsUsage = z.infer<typeof TranscriptionsUsageSchema>;

export const TranscriptionsSchema = z.object({
  text: z.string(),
  // `verbose_json` only
  task: z.literal("transcribe").optional(),
  language: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  segments: z.array(TranscriptionsSegmentSchema).optional(),
  usage: TranscriptionsUsageSchema,
  // Extensions
  provider_metadata: z.unknown().optional().meta({ extension: true }),
});
export type Transcriptions = z.infer<typeof TranscriptionsSchema>;
