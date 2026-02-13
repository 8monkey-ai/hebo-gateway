import type {
  ChatCompletions,
  ChatCompletionsBody,
  ChatCompletionsContentPart,
  ChatCompletionsMessage,
} from "../endpoints/chat-completions/schema";
import type { Embeddings, EmbeddingsBody } from "../endpoints/embeddings";

import { resolveRequestId } from "../utils/headers";

type GenAIPart = Record<string, unknown>;
const DEFAULT_ATTRIBUTES_LEVEL = "recommended";
const HEBO_BAGGAGE_PREFIX = "hebo.";

const toTextPart = (content: string): GenAIPart => ({ type: "text", content });

const toMessageParts = (message: ChatCompletionsMessage): GenAIPart[] => {
  if (message.role === "assistant") {
    const parts: GenAIPart[] = [];
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
    const parts: GenAIPart[] = [];
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

export const getRequestAttributes = (
  request?: Request,
  attributesLevel = DEFAULT_ATTRIBUTES_LEVEL,
) => {
  if (!request) return {};

  let url;
  try {
    // FUTURE: use URL from lifecycle
    url = new URL(request.url);
  } catch {}

  const attrs = {
    "http.request.method": request.method,
    "url.full": request.url,
    "url.path": url?.pathname,
    "url.scheme": url?.protocol.replace(":", ""),
    "server.address": url?.hostname,
    "server.port": url
      ? url.port
        ? Number(url.port)
        : url.protocol === "https:"
          ? 443
          : 80
      : undefined,
  };

  if (attributesLevel !== "required") {
    Object.assign(attrs, {
      "http.request.id": resolveRequestId(request),
      "user_agent.original": request.headers.get("user-agent") ?? undefined,
    });
  }

  if (attributesLevel === "full") {
    Object.assign(attrs, {
      // FUTURE: "url.query"
      "http.request.header.content-type": [request.headers.get("content-type") ?? undefined],
      "http.request.header.content-length": [request.headers.get("content-length") ?? undefined],
      // FUTURE: "client.address"
    });
  }

  return attrs;
};

export const getAIAttributes = (
  body?: object,
  result?: object,
  attributesLevel = DEFAULT_ATTRIBUTES_LEVEL,
  providerName?: string,
) => {
  if (!body && !result) return {};

  const isChat = !!body && "messages" in body;
  const isEmbeddings = !!body && "input" in body;

  const attrs = {
    "gen_ai.operation.name": isEmbeddings ? "embeddings" : isChat ? "chat" : undefined,
    "gen_ai.output.type": isEmbeddings ? "embedding" : isChat ? "text" : undefined,
    "gen_ai.request.model": body && "model" in body ? body.model : undefined,
    "gen_ai.provider.name": providerName,
  };

  if (isChat) {
    if (body) {
      const inputs = body as ChatCompletionsBody;

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
          // FUTURE: only construct once
          "gen_ai.system_instructions": inputs.messages
            .filter((m) => m.role === "system")
            .map((m) => JSON.stringify({ parts: [toTextPart(m.content)] })),
          "gen_ai.input.messages": inputs.messages
            .filter((m) => m.role !== "system")
            .map((m) => JSON.stringify({ role: m.role, parts: toMessageParts(m) })),
          "gen_ai.tool.definitions": JSON.stringify(inputs.tools),
        });
      }
    }

    // FUTURE: implement streaming
    if (result && !(result instanceof ReadableStream)) {
      const completions = result as ChatCompletions;

      Object.assign(attrs, {
        "gen_ai.response.model": completions.model,
        "gen_ai.response.id": completions.id,
      });

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
    }
  }

  if (isEmbeddings) {
    if (body) {
      const inputs = body as EmbeddingsBody;
      if (attributesLevel !== "required") {
        Object.assign(attrs, {
          "gen_ai.embeddings.dimension.count": inputs.dimensions,
        });
      }
    }

    if (result) {
      const embeddings = result as Embeddings;

      Object.assign(attrs, {
        "gen_ai.response.model": embeddings.model,
      });

      if (attributesLevel !== "required") {
        Object.assign(attrs, {
          "gen_ai.usage.input_tokens": embeddings.usage?.prompt_tokens,
          "gen_ai.usage.total_tokens": embeddings.usage?.total_tokens,
        });
      }
    }
  }

  return attrs;
};

export const getResponseAttributes = (
  response?: Response,
  attributesLevel = DEFAULT_ATTRIBUTES_LEVEL,
) => {
  if (!response) return {};

  const attrs = {
    "http.response.status_code": response.status,
  };

  if (attributesLevel === "full") {
    Object.assign(attrs, {
      "http.response.header.content-type": [response.headers.get("content-type") ?? undefined],
      "http.response.header.content-length": [response.headers.get("content-length") ?? undefined],
    });
  }

  return attrs;
};

export const getBaggageAttributes = (request?: Request) => {
  const h = request?.headers.get("baggage");
  if (!h) return {};

  const attrs: Record<string, string> = {};

  for (const part of h.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (!k || !v) continue;

    const [rawValue] = v.split(";", 1);
    if (!rawValue) continue;

    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {}

    if (k.startsWith(HEBO_BAGGAGE_PREFIX)) {
      attrs[k.slice(HEBO_BAGGAGE_PREFIX.length)] = value;
    }
  }

  return attrs;
};
