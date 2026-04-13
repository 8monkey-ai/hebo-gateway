import type { Attributes } from "@opentelemetry/api";
import type { FinishReason } from "ai";

import { type TelemetrySignalLevel } from "../../types";
import type {
  AssistantContentBlock,
  Messages,
  MessagesBody,
  MessagesMessage,
  MessagesResponseContentBlock,
  UserContentBlock,
} from "./schema";

type TelemetryPart = {
  type: string;
  [key: string]: unknown;
};

type TelemetryMessageLog = {
  role?: string;
  type?: string;
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

const toUserBlockParts = (block: UserContentBlock): TelemetryPart => {
  switch (block.type) {
    case "text":
      return { type: "text", content: block.text };
    case "image":
      if (block.source.type === "base64") {
        return toBlobPart("image", block.source.media_type);
      }
      return { type: "uri", modality: "image", uri: block.source.url };
    case "tool_result":
      return {
        type: "tool_call_response",
        id: block.tool_use_id,
        response:
          typeof block.content === "string"
            ? block.content
            : block.content
              ? block.content.map((p) => (p.type === "text" ? p.text : "")).join("")
              : "",
      };
    case "document":
      if (block.source.type === "base64") {
        return toBlobPart("file", block.source.media_type);
      }
      if (block.source.type === "url") {
        return { type: "uri", modality: "file", uri: block.source.url };
      }
      return { type: "text", content: block.source.text };
    default:
      return { type: (block as { type: string }).type, content: "[UNHANDLED_CONTENT_BLOCK]" };
  }
};

const toMessageParts = (message: MessagesMessage): TelemetryPart[] => {
  if (typeof message.content === "string") {
    return [{ type: "text", content: message.content }];
  }

  const parts: TelemetryPart[] = [];
  for (const block of message.content) {
    if (message.role === "user") {
      parts.push(toUserBlockParts(block as UserContentBlock));
    } else {
      const assistantBlock = block as AssistantContentBlock;
      switch (assistantBlock.type) {
        case "text":
          parts.push({ type: "text", content: assistantBlock.text });
          break;
        case "tool_use":
          parts.push({
            type: "tool_call",
            id: assistantBlock.id,
            name: assistantBlock.name,
            arguments:
              typeof assistantBlock.input === "string"
                ? assistantBlock.input
                : JSON.stringify(assistantBlock.input),
          });
          break;
        case "thinking":
          parts.push({ type: "reasoning", content: assistantBlock.thinking });
          break;
        case "redacted_thinking":
          parts.push({ type: "reasoning", content: "[ENCRYPTED_REASONING]" });
          break;
      }
    }
  }
  return parts;
};

const toResponseBlockPart = (block: MessagesResponseContentBlock): TelemetryPart => {
  switch (block.type) {
    case "text":
      return { type: "text", content: block.text };
    case "tool_use":
      return {
        type: "tool_call",
        id: block.id,
        name: block.name,
        arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input),
      };
    case "thinking":
      return { type: "reasoning", content: block.thinking };
    case "redacted_thinking":
      return { type: "reasoning", content: "[ENCRYPTED_REASONING]" };
    default:
      return { type: "unknown", content: "[UNHANDLED_RESPONSE_BLOCK]" };
  }
};

export const getMessagesRequestAttributes = (
  body: MessagesBody,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.request.stream": body.stream,
      "gen_ai.request.service_tier": body.service_tier,
      "gen_ai.request.max_tokens": body.max_tokens,
      "gen_ai.request.temperature": body.temperature,
      "gen_ai.request.top_p": body.top_p,
    });

    if (body.metadata) {
      for (const key in body.metadata) {
        attrs[`gen_ai.request.metadata.${key}`] = (body.metadata as Record<string, string>)[key];
      }
    }
  }

  if (signalLevel === "full") {
    const inputMessages: string[] = [];

    // System prompt
    if (body.system) {
      const systemText =
        typeof body.system === "string" ? body.system : body.system.map((b) => b.text).join("");
      inputMessages.push(
        JSON.stringify({
          role: "system",
          parts: [{ type: "text", content: systemText }],
        } satisfies TelemetryMessageLog),
      );
    }

    // Messages
    for (const message of body.messages) {
      inputMessages.push(
        JSON.stringify({
          role: message.role,
          parts: toMessageParts(message),
        } satisfies TelemetryMessageLog),
      );
    }

    Object.assign(attrs, {
      "gen_ai.input.messages": inputMessages,
      "gen_ai.tool.definitions": body.tools?.map((toolDef) => JSON.stringify(toolDef)),
    });
  }

  return attrs;
};

export const getMessagesResponseAttributes = (
  response: Messages,
  signalLevel?: TelemetrySignalLevel,
  finishReason?: FinishReason,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {
    "gen_ai.response.id": response.id,
  };

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.response.finish_reasons": finishReason
        ? [finishReason]
        : response.stop_reason
          ? [response.stop_reason]
          : [],
      "gen_ai.response.service_tier": response.service_tier,
      "gen_ai.usage.input_tokens": response.usage?.input_tokens,
      "gen_ai.usage.output_tokens": response.usage?.output_tokens,
      "gen_ai.usage.cache_read.input_tokens": response.usage?.cache_read_input_tokens,
      "gen_ai.usage.cache_creation.input_tokens": response.usage?.cache_creation_input_tokens,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.output.messages": [
        JSON.stringify({
          role: "assistant",
          parts: response.content.map(toResponseBlockPart),
        } satisfies TelemetryMessageLog),
      ],
    });
  }

  return attrs;
};
