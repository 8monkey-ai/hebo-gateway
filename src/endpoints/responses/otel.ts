import type { Attributes } from "@opentelemetry/api";

import type { Responses, ResponsesBody } from "./schema";

import { type GatewayContext, type TelemetrySignalLevel } from "../../types";

const toTextPart = (content: string): Record<string, unknown> => ({ type: "text", content });

const toMessageParts = (message: any): Record<string, unknown>[] => {
  if (message.role === "assistant") {
    const parts: Record<string, unknown>[] = [];
    if (typeof message.content === "string") parts.push(toTextPart(message.content));
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
  }

  if (message.role === "tool") {
    return [{ type: "tool_call_response", id: message.tool_call_id, content: message.content }];
  }

  if (message.role === "user") {
    const parts: Record<string, unknown>[] = [];
    if (typeof message.content === "string") parts.push(toTextPart(message.content));
    if (Array.isArray(message.content)) {
      for (const part of message.content as any[]) {
        if (part.type === "input_text") {
          parts.push(toTextPart(part.text));
        } else if (part.type === "input_image") {
          parts.push({ type: "image", content: part.image_url });
        } else if (part.type === "input_audio") {
          parts.push({
            type: "audio",
            content: "[REDACTED_BINARY_DATA]",
            format: part.input_audio.format,
          });
        } else if (part.type === "input_file") {
          parts.push({
            type: "file",
            content: part.filename ?? part.file_url ?? "[REDACTED_BINARY_DATA]",
          });
        }
      }
    }
    return parts;
  }

  if (message.role === "system") {
    return [toTextPart(typeof message.content === "string" ? message.content : "")];
  }

  return [];
};

export const getResponsesGeneralAttributes = (
  ctx: GatewayContext,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const requestModel = typeof ctx.body?.model === "string" ? ctx.body.model : ctx.modelId;

  return {
    "gen_ai.operation.name": ctx.operation,
    "gen_ai.request.model": requestModel,
    "gen_ai.response.model": ctx.resolvedModelId,
    "gen_ai.provider.name": ctx.resolvedProviderId,
  };
};

export const getResponsesRequestAttributes = (
  inputs: ResponsesBody,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {};

  if (inputs.seed !== undefined) {
    Object.assign(attrs, { "gen_ai.request.seed": inputs.seed });
  }

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.request.stream": inputs.stream,
      "gen_ai.request.frequency_penalty": inputs.frequency_penalty,
      "gen_ai.request.max_tokens":
        inputs.max_output_tokens ?? inputs.max_completion_tokens ?? inputs.max_tokens,
      "gen_ai.request.presence_penalty": inputs.presence_penalty,
      "gen_ai.request.stop_sequences": inputs.stop
        ? Array.isArray(inputs.stop)
          ? inputs.stop
          : [inputs.stop]
        : undefined,
      "gen_ai.request.temperature": inputs.temperature,
      "gen_ai.request.top_p": inputs.top_p,
    });
  }

  if (signalLevel === "full") {
    const messages =
      typeof inputs.input === "string"
        ? [{ role: "user" as const, content: inputs.input }]
        : inputs.input
            .map((item) => {
              if (item && typeof item === "object" && "type" in item && item.type === "message") {
                return item as any;
              }
              return null;
            })
            .filter((item): item is any => item !== null);

    Object.assign(attrs, {
      "gen_ai.input.messages": messages.map((m) =>
        JSON.stringify({ role: m.role, parts: toMessageParts(m) }),
      ),
      "gen_ai.tool.definitions": JSON.stringify(inputs.tools),
    });
  }

  return attrs;
};

export const getResponsesResponseAttributes = (
  response: Responses,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  const attrs: Attributes = {
    "gen_ai.response.id": response.id,
  };

  if (signalLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.usage.total_tokens": response.usage?.total_tokens,
      "gen_ai.usage.input_tokens": response.usage?.input_tokens,
      "gen_ai.usage.cached_tokens": response.usage?.input_tokens_details?.cached_tokens,
      "gen_ai.usage.output_tokens": response.usage?.output_tokens,
      "gen_ai.usage.reasoning_tokens": response.usage?.output_tokens_details?.reasoning_tokens,
    });
  }

  if (signalLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.output.messages": response.output
        .filter(
          (item): item is Extract<Responses["output"][number], { type: "message" }> =>
            item.type === "message",
        )
        .map((m) =>
          JSON.stringify({
            role: m.role,
            parts: m.content.map((part: { type: string; text: string }) => ({
              type: part.type,
              content: part.text,
            })),
            tool_calls: m.tool_calls,
          }),
        ),
    });
  }

  return attrs;
};
