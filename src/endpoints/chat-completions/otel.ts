import type { Attributes } from "@opentelemetry/api";

import type {
  ChatCompletionsAssistantMessage,
  ChatCompletions,
  ChatCompletionsBody,
  ChatCompletionsContentPart,
  ChatCompletionsContentPartText,
  ChatCompletionsMessage,
} from "./schema";

import { type TelemetrySignalLevel } from "../../types";
import { parseDataUrl } from "../../utils/url";

const toTextParts = (content: string | ChatCompletionsContentPart[] | null | undefined) => {
  if (typeof content === "string") {
    return [{ type: "text", content }];
  }

  const result = [];
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "text") {
        result.push({ type: "text", content: part.text });
      }
    }
  }
  return result;
};

const toBlobPart = (modality: string, mimeType?: string) => {
  const part: Record<string, unknown> = {
    type: "blob",
    modality,
    content: "[REDACTED_BINARY_DATA]",
  };
  if (mimeType) part["mime_type"] = mimeType;
  return part;
};

const toToolResponsePart = (id: string, content: string | ChatCompletionsContentPartText[]) => ({
  type: "tool_call_response" as const,
  id,
  response: typeof content === "string" ? content : content.map((p) => p.text).join(""),
});

const toAssistantParts = (message: ChatCompletionsAssistantMessage) => {
  const parts: Record<string, unknown>[] = [];

  if (typeof message.reasoning === "string") {
    parts.push({ type: "reasoning", content: message.reasoning });
  }

  for (const part of toTextParts(message.content)) {
    parts.push(part);
  }

  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      parts.push({
        type: "tool_call",
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      });
    }
  }

  return parts;
};

const toUserParts = (content: string | ChatCompletionsContentPart[]) => {
  if (typeof content === "string") return [{ type: "text", content }];

  const parts: Record<string, unknown>[] = [];

  for (const part of content) {
    switch (part.type) {
      case "text":
        parts.push({ type: "text", content: part.text });
        break;
      case "image_url": {
        const url = part.image_url.url;
        if (url.slice(0, 5).toLowerCase() === "data:") {
          const { mimeType } = parseDataUrl(url);
          parts.push(toBlobPart("image", mimeType || undefined));
        } else {
          parts.push({ type: "uri", modality: "image", uri: url });
        }
        break;
      }
      case "input_audio":
        parts.push(toBlobPart("audio", `audio/${part.input_audio.format}`));
        break;
      case "file": {
        const filePart = toBlobPart("file", part.file.media_type);
        if (part.file.filename) filePart["file_name"] = part.file.filename;
        parts.push(filePart);
        break;
      }
    }
  }

  return parts;
};

const toMessageParts = (message: ChatCompletionsMessage) => {
  switch (message.role) {
    case "assistant":
      return toAssistantParts(message);
    case "tool":
      return [toToolResponsePart(message.tool_call_id, message.content)];
    case "user":
      return toUserParts(message.content);
    // FUTURE: remove once Langfuse supports gen_ai.system_instructions
    // https://github.com/langfuse/langfuse/issues/11607
    case "system":
      return toTextParts(message.content);
    default:
      throw new Error(`Unhandled content part type: ${(message as { role: string }).role}`);
  }
};

export const getChatRequestAttributes = (
  inputs: ChatCompletionsBody,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (inputs.seed !== undefined) {
    Object.assign(attrs, { "gen_ai.request.seed": inputs.seed });
  }

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      // FUTURE: add reasoning info
      "gen_ai.request.stream": inputs.stream,
      "gen_ai.request.service_tier": inputs.service_tier,
      "gen_ai.request.frequency_penalty": inputs.frequency_penalty,
      "gen_ai.request.max_tokens": inputs.max_completion_tokens,
      "gen_ai.request.presence_penalty": inputs.presence_penalty,
      "gen_ai.request.stop_sequences": inputs.stop
        ? Array.isArray(inputs.stop)
          ? inputs.stop
          : [inputs.stop]
        : undefined,
      "gen_ai.request.temperature": inputs.temperature,
      "gen_ai.request.top_p": inputs.top_p,
    });

    if (inputs.metadata) {
      for (const key in inputs.metadata) {
        attrs[`gen_ai.request.metadata.${key}`] = inputs.metadata[key];
      }
    }
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      // FUTURE: move system instructions from messages to here
      // blocker: https://github.com/langfuse/langfuse/issues/11607
      // "gen_ai.system_instructions": inputs.messages
      //   .filter((m) => m.role === "system")
      //   .map((m) => JSON.stringify(toTextPart(m.content))),
      "gen_ai.input.messages": inputs.messages
        //.filter((m) => m.role !== "system")
        .map((m) => JSON.stringify({ role: m.role, parts: toMessageParts(m) })),
      "gen_ai.tool.definitions": inputs.tools?.map((toolDefinition) =>
        JSON.stringify(toolDefinition),
      ),
    });
  }

  return attrs;
};

export const getChatResponseAttributes = (
  completions: ChatCompletions,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {
    "gen_ai.response.id": completions.id,
  };

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.response.finish_reasons": completions.choices?.map((c) => c.finish_reason),
      "gen_ai.response.service_tier": completions.service_tier,
      "gen_ai.usage.total_tokens": completions.usage?.total_tokens,
      "gen_ai.usage.input_tokens": completions.usage?.prompt_tokens,
      "gen_ai.usage.cache_read.input_tokens":
        completions.usage?.prompt_tokens_details?.cached_tokens,
      "gen_ai.usage.output_tokens": completions.usage?.completion_tokens,
      "gen_ai.usage.reasoning.output_tokens":
        completions.usage?.completion_tokens_details?.reasoning_tokens,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.output.messages": completions.choices?.map((c) =>
        JSON.stringify({
          role: c.message.role,
          parts: toMessageParts(c.message),
          finish_reason: c.finish_reason,
        }),
      ),
    });
  }

  return attrs;
};
