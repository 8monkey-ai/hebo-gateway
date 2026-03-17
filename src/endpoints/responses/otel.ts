import type { Attributes } from "@opentelemetry/api";
import type { FinishReason } from "ai";

import type { Responses, ResponsesBody, ResponsesInputItem, ResponsesMessageItem } from "./schema";

import { type TelemetrySignalLevel } from "../../types";

const toInputTextParts = (content: string | { type: string; text?: string }[]) => {
  if (typeof content === "string") {
    return [{ type: "text", content }];
  }

  const result = [];
  if (Array.isArray(content)) {
    for (const part of content) {
      if ("text" in part && typeof part.text === "string") {
        result.push({ type: "text", content: part.text });
      }
    }
  }
  return result;
};

const toItemParts = (item: ResponsesInputItem) => {
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
              : item.output
                  .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
                  .join(""),
        },
      ];
    case "reasoning":
      return item.summary.map((s) => ({ type: "reasoning", content: s.text }));
  }
};

const toMessageParts = (item: ResponsesMessageItem) => {
  switch (item.role) {
    case "assistant":
      return toInputTextParts(item.content);
    case "user":
    case "system":
    case "developer":
      return toInputTextParts(item.content);
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
      inputMessages.push(
        JSON.stringify({
          role: "system",
          parts: [{ type: "text", content: body.instructions }],
        }),
      );
    }

    if (typeof body.input === "string") {
      inputMessages.push(
        JSON.stringify({
          role: "user",
          parts: [{ type: "text", content: body.input }],
        }),
      );
    } else if (Array.isArray(body.input)) {
      for (const item of body.input) {
        if (item.type === "message") {
          inputMessages.push(
            JSON.stringify({
              role: item.role,
              parts: toItemParts(item),
            }),
          );
        } else {
          inputMessages.push(JSON.stringify({ type: item.type, parts: toItemParts(item) }));
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
      "gen_ai.output.messages": responses.output?.map((item) =>
        JSON.stringify({
          type: item.type,
          ...(item.type === "message"
            ? {
                role: item.role,
                parts: item.content.map((c) => ({ type: "text", content: c.text })),
              }
            : item.type === "function_call"
              ? {
                  name: item.name,
                  arguments: item.arguments,
                }
              : {}),
          status: item.status,
        }),
      ),
    });
  }

  return attrs;
};
