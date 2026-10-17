import type { Attributes } from "@opentelemetry/api";

import { type TelemetrySignalLevel } from "../../types";
import { toAudioMediaType } from "../shared/converters";
import type { Transcriptions, TranscriptionsBody } from "./schema";

export const getTranscriptionsRequestAttributes = (
  body: TranscriptionsBody,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.request.temperature": body.temperature,
    });
  }

  if (signalLevel === "full") {
    const parts: Record<string, unknown>[] = [
      {
        type: "blob",
        modality: "audio",
        mime_type: toAudioMediaType(body.input_audio.format),
        content: "[REDACTED_BINARY_DATA]",
      },
    ];
    if (body.prompt) parts.push({ type: "text", content: body.prompt });

    Object.assign(attrs, {
      "gen_ai.input.messages": [JSON.stringify({ role: "user", parts })],
    });
  }

  return attrs;
};

export const getTranscriptionsResponseAttributes = (
  transcriptions: Transcriptions,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.usage.input_tokens": transcriptions.usage?.input_tokens,
      "gen_ai.usage.output_tokens": transcriptions.usage?.output_tokens,
      "gen_ai.usage.total_tokens": transcriptions.usage?.total_tokens,
      "gen_ai.usage.audio_seconds": transcriptions.usage?.seconds,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.output.messages": [
        JSON.stringify({
          role: "assistant",
          parts: [{ type: "text", content: transcriptions.text }],
        }),
      ],
    });
  }

  return attrs;
};
