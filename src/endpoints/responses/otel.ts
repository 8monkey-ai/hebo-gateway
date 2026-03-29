import type { Attributes } from "@opentelemetry/api";
import type { FinishReason } from "ai";

import type {
  Responses,
  ResponsesBody,
  ResponsesInputContent,
  ResponsesInputItem,
  ResponsesMessageItem,
} from "./schema";

import { type TelemetrySignalLevel } from "../../types";
import { parseDataUrl } from "../../utils/url";

type TelemetryPart = {
  type: string;
  [key: string]: unknown;
};

type TelemetryMessageLog = {
  role?: string;
  type?: string;
  status?: string;
  name?: string;
  arguments?: string;
  parts: TelemetryPart[];
  [key: string]: unknown;
};

const toBlobPart = (modality: string, mimeType?: string): TelemetryPart => {
  const part: TelemetryPart = {
    type: "blob",
    modality,
    content: "[REDACTED_BINARY_DATA]",
  };
  if (mimeType) part["mime_type"] = mimeType;
  return part;
};

const toInputParts = (content: string | ResponsesInputContent[]): TelemetryPart[] => {
  if (typeof content === "string") return [{ type: "text", content }];

  const parts: TelemetryPart[] = [];

  for (const part of content) {
    switch (part.type) {
      case "input_text":
        parts.push({ type: "text", content: part.text });
        break;
      case "input_image": {
        const url = part.image_url;
        if (url && url.slice(0, 5).toLowerCase() === "data:") {
          const { mimeType } = parseDataUrl(url);
          parts.push(toBlobPart("image", mimeType || undefined));
        } else if (url) {
          parts.push({ type: "uri", modality: "image", uri: url });
        } else if (part.file_id) {
          parts.push({ type: "blob", modality: "image", content: `file_id:${part.file_id}` });
        }
        break;
      }
      case "input_audio":
        parts.push(toBlobPart("audio", `audio/${part.input_audio.format}`));
        break;
      case "input_file": {
        if (part.file_data) {
          parts.push(toBlobPart("file"));
        } else if (part.file_url) {
          parts.push({ type: "uri", modality: "file", uri: part.file_url });
        } else if (part.file_id) {
          parts.push({ type: "blob", modality: "file", content: `file_id:${part.file_id}` });
        }
        break;
      }
    }
  }

  return parts;
};

const toOutputTextParts = (content: string | { type: string; text: string }[]): TelemetryPart[] => {
  if (typeof content === "string") {
    return [{ type: "text", content }];
  }

  return content.map((part) => ({ type: "text", content: part.text }));
};

const toItemParts = (item: ResponsesInputItem): TelemetryPart[] => {
  switch (item.type) {
    case "message":
      return toMessageParts(item);
    case "function_call":
      return [
        {
          type: "tool_call",
          id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        },
      ];
    case "function_call_output":
      return [
        {
          type: "tool_call_response",
          id: item.call_id,
          response:
            typeof item.output === "string"
              ? item.output
              : item.output.map((p) => (p.type === "input_text" ? p.text : "")).join(""),
        },
      ];
    case "reasoning":
      return item.summary.map((s) => ({ type: "reasoning", content: s.text }));
  }
};

const toMessageParts = (item: ResponsesMessageItem): TelemetryPart[] => {
  switch (item.role) {
    case "assistant":
      return toOutputTextParts(item.content);
    case "user":
    case "developer":
    case "system":
      // FUTURE: remove once Langfuse supports gen_ai.system_instructions
      // https://github.com/langfuse/langfuse/issues/11607
      return toInputParts(item.content);
    default:
      return [];
  }
};

export const getResponsesRequestAttributes = (
  body: ResponsesBody,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.request.stream": body.stream,
      "gen_ai.request.service_tier": body.service_tier,
      "gen_ai.request.frequency_penalty": body.frequency_penalty,
      "gen_ai.request.max_tokens": body.max_output_tokens,
      "gen_ai.request.presence_penalty": body.presence_penalty,
      "gen_ai.request.temperature": body.temperature,
      "gen_ai.request.top_p": body.top_p,
      // FUTURE: Support text.verbosity configuration
    });

    if (body.metadata) {
      for (const key in body.metadata) {
        attrs[`gen_ai.request.metadata.${key}`] = body.metadata[key];
      }
    }
  }

  if (signalLevel === "full") {
    const inputMessages: string[] = [];

    if (body.instructions) {
      // FUTURE: move system instructions from messages to here
      // blocker: https://github.com/langfuse/langfuse/issues/11607
      inputMessages.push(
        JSON.stringify({
          role: "system",
          parts: [{ type: "text", content: body.instructions }],
        } satisfies TelemetryMessageLog),
      );
    }

    if (typeof body.input === "string") {
      inputMessages.push(
        JSON.stringify({
          role: "user",
          parts: [{ type: "text", content: body.input }],
        } satisfies TelemetryMessageLog),
      );
    } else if (Array.isArray(body.input)) {
      for (const item of body.input) {
        if (item.type === "message") {
          inputMessages.push(
            JSON.stringify({
              role: item.role,
              parts: toItemParts(item),
            } satisfies TelemetryMessageLog),
          );
        } else {
          inputMessages.push(
            JSON.stringify({
              type: item.type,
              parts: toItemParts(item),
            } satisfies TelemetryMessageLog),
          );
        }
      }
    }

    Object.assign(attrs, {
      "gen_ai.input.messages": inputMessages,
      "gen_ai.tool.definitions": body.tools?.map((toolDef) => JSON.stringify(toolDef)),
    });
  }

  return attrs;
};

export const getResponsesResponseAttributes = (
  responses: Responses,
  signalLevel?: TelemetrySignalLevel,
  finishReason?: FinishReason,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {
    "gen_ai.response.id": responses.id,
  };

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.response.finish_reasons": finishReason ? [finishReason] : [responses.status],
      "gen_ai.response.service_tier": responses.service_tier,
      "gen_ai.usage.total_tokens": responses.usage?.total_tokens,
      "gen_ai.usage.input_tokens": responses.usage?.input_tokens,
      "gen_ai.usage.cache_read.input_tokens": responses.usage?.input_tokens_details?.cached_tokens,
      "gen_ai.usage.output_tokens": responses.usage?.output_tokens,
      "gen_ai.usage.reasoning.output_tokens":
        responses.usage?.output_tokens_details?.reasoning_tokens,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.output.messages": responses.output?.map((item) => {
        const base: TelemetryMessageLog = {
          type: item.type,
          status: item.status,
          parts: [],
        };

        if (item.type === "message") {
          base.role = item.role;
          base.parts = item.content.map((c) => ({ type: "text", content: c.text }));
        } else if (item.type === "function_call") {
          base.name = item.name;
          base.arguments = item.arguments;
        }

        return JSON.stringify(base);
      }),
    });
  }

  return attrs;
};
