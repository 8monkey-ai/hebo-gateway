import type { Attributes } from "@opentelemetry/api";

import type { GatewayContext } from "../../types";
import type {
  ChatCompletions,
  ChatCompletionsBody,
  ChatCompletionsContentPart,
  ChatCompletionsMessage,
} from "./schema";

const DEFAULT_ATTRIBUTES_LEVEL = "recommended";

const toTextPart = (content: string): Record<string, unknown> => ({ type: "text", content });

const toMessageParts = (message: ChatCompletionsMessage): Record<string, unknown>[] => {
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
      for (const part of message.content as ChatCompletionsContentPart[]) {
        if (part.type === "text") {
          parts.push(toTextPart(part.text));
        } else if (part.type === "image_url") {
          parts.push({ type: "image", content: part.image_url.url });
        } else {
          parts.push({
            type: "file",
            // FUTURE: optionally expose safe metadata without raw binary payloads.
            content: part.file.filename ?? "[REDACTED_BINARY_DATA]",
            media_type: part.file.media_type,
          });
        }
      }
    }
    return parts;
  }

  return [];
};

export const getChatGeneralAttributes = (ctx: GatewayContext): Attributes => {
  const requestModel =
    ctx.body && "model" in ctx.body && typeof ctx.body.model === "string"
      ? ctx.body.model
      : ctx.modelId;

  return {
    "gen_ai.operation.name": ctx.operation,
    "gen_ai.request.model": requestModel,
    "gen_ai.response.model": ctx.resolvedModelId,
    "gen_ai.provider.name": ctx.resolvedProviderId,
  };
};

export const getChatRequestAttributes = (
  inputs: ChatCompletionsBody,
  attributesLevel: string = DEFAULT_ATTRIBUTES_LEVEL,
): Attributes => {
  const attrs: Attributes = {};

  if (inputs.seed !== undefined) {
    Object.assign(attrs, { "gen_ai.request.seed": inputs.seed });
  }

  if (attributesLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.request.stream": inputs.stream,
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
  }

  if (attributesLevel === "full") {
    Object.assign(attrs, {
      "gen_ai.system_instructions": inputs.messages
        .filter((m) => m.role === "system")
        .map((m) => JSON.stringify({ parts: [toTextPart(m.content)] })),
      "gen_ai.input.messages": inputs.messages
        .filter((m) => m.role !== "system")
        .map((m) => JSON.stringify({ role: m.role, parts: toMessageParts(m) })),
      "gen_ai.tool.definitions": JSON.stringify(inputs.tools),
    });
  }

  return attrs;
};

export const getChatResponseAttributes = (
  completions: ChatCompletions,
  attributesLevel: string = DEFAULT_ATTRIBUTES_LEVEL,
): Attributes => {
  const attrs: Attributes = {
    "gen_ai.response.id": completions.id,
  };

  if (attributesLevel !== "required") {
    Object.assign(attrs, {
      "gen_ai.response.finish_reasons": completions.choices?.map((c) => c.finish_reason),
      "gen_ai.usage.total_tokens": completions.usage?.total_tokens,
      "gen_ai.usage.input_tokens": completions.usage?.prompt_tokens,
      "gen_ai.usage.cached_tokens": completions.usage?.prompt_tokens_details?.cached_tokens,
      "gen_ai.usage.output_tokens": completions.usage?.completion_tokens,
      "gen_ai.usage.reasoning_tokens":
        completions.usage?.completion_tokens_details?.reasoning_tokens,
    });
  }

  if (attributesLevel === "full") {
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
