import type { Attributes } from "@opentelemetry/api";

import type {
  ResponsesBody,
  ResponsesResponse,
  ResponsesInputItem,
  ResponsesOutputItem,
} from "./schema";

import { type TelemetrySignalLevel } from "../../types";
import { parseDataUrl } from "../../utils/url";

const toBlobPart = (modality: string, mimeType?: string) => {
  const part: Record<string, unknown> = {
    type: "blob",
    modality,
    content: "[REDACTED_BINARY_DATA]",
  };
  if (mimeType) part["mime_type"] = mimeType;
  return part;
};

const toInputItemParts = (item: ResponsesInputItem) => {
  // Function call item
  if ("type" in item && item.type === "function_call") {
    return [
      {
        type: "tool_call",
        id: item.call_id,
        name: item.name,
        arguments: item.arguments,
      },
    ];
  }

  // Function call output item
  if ("type" in item && item.type === "function_call_output") {
    return [
      {
        type: "tool_call_response",
        id: item.call_id,
        response: item.output,
      },
    ];
  }

  // Message item
  const content = item.content;
  if (typeof content === "string") return [{ type: "text", content }];

  const parts: Record<string, unknown>[] = [];
  for (const part of content) {
    switch (part.type) {
      case "input_text":
      case "output_text":
        parts.push({ type: "text", content: part.text });
        break;
      case "input_image": {
        const url = part.image_url;
        if (url.slice(0, 5).toLowerCase() === "data:") {
          const { mimeType } = parseDataUrl(url);
          parts.push(toBlobPart("image", mimeType || undefined));
        } else {
          parts.push({ type: "uri", modality: "image", uri: url });
        }
        break;
      }
      case "input_audio":
        parts.push(toBlobPart("audio", `audio/${part.format}`));
        break;
      case "input_file": {
        const filePart = toBlobPart("file", "media_type" in part ? part.media_type : undefined);
        if (part.filename) filePart["file_name"] = part.filename;
        parts.push(filePart);
        break;
      }
    }
  }
  return parts;
};

const toOutputItemParts = (item: ResponsesOutputItem) => {
  switch (item.type) {
    case "message":
      return item.content.map((p) => ({ type: "text", content: p.text }));
    case "function_call":
      return [
        {
          type: "tool_call",
          id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        },
      ];
    case "reasoning":
      return (item.summary ?? []).map((s) => ({
        type: "reasoning",
        content: s.text,
      }));
    default:
      return [];
  }
};

const inputItemRole = (item: ResponsesInputItem): string => {
  if ("type" in item && item.type === "function_call") return "assistant";
  if ("type" in item && item.type === "function_call_output") return "tool";
  return item.role;
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
    });

    if (body.metadata) {
      for (const key in body.metadata) {
        attrs[`gen_ai.request.metadata.${key}`] = body.metadata[key];
      }
    }
  }

  if (signalLevel === "full") {
    const inputMessages =
      typeof body.input === "string"
        ? [JSON.stringify({ role: "user", parts: [{ type: "text", content: body.input }] })]
        : body.input.map((item) =>
            JSON.stringify({
              role: inputItemRole(item),
              parts: toInputItemParts(item),
            }),
          );

    if (body.instructions) {
      inputMessages.unshift(
        JSON.stringify({
          role: "system",
          parts: [{ type: "text", content: body.instructions }],
        }),
      );
    }

    Object.assign(attrs, {
      "gen_ai.input.messages": inputMessages,
      "gen_ai.tool.definitions": body.tools?.map((t) =>
        JSON.stringify({
          type: t.type,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }),
      ),
    });
  }

  return attrs;
};

export const getResponsesResponseAttributes = (
  response: ResponsesResponse,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {
    "gen_ai.response.id": response.id,
  };

  if (signalLevel !== "required") {
    const finishReasons: string[] = [];
    if (response.status === "completed") finishReasons.push("stop");
    else if (response.status === "incomplete") finishReasons.push("length");
    else if (response.status === "failed") finishReasons.push("error");

    // Check for tool calls
    if (response.output.some((item) => item.type === "function_call")) {
      finishReasons.length = 0;
      finishReasons.push("tool_calls");
    }

    Object.assign(attrs, {
      "gen_ai.response.finish_reasons": finishReasons,
      "gen_ai.response.service_tier": response.service_tier,
      "gen_ai.usage.total_tokens": response.usage?.total_tokens,
      "gen_ai.usage.input_tokens": response.usage?.input_tokens,
      "gen_ai.usage.cache_read.input_tokens": response.usage?.input_tokens_details?.cached_tokens,
      "gen_ai.usage.output_tokens": response.usage?.output_tokens,
      "gen_ai.usage.reasoning.output_tokens":
        response.usage?.output_tokens_details?.reasoning_tokens,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.output.messages": response.output.map((item) =>
        JSON.stringify({
          role: item.type === "function_call" ? "assistant" : item.type,
          parts: toOutputItemParts(item),
        }),
      ),
    });
  }

  return attrs;
};
