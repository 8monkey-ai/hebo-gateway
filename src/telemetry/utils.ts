import type { Embeddings, EmbeddingsBody } from "#/endpoints/embeddings";

import { resolveRequestId } from "#/utils/headers";

import type {
  ChatCompletions,
  ChatCompletionsBody,
  ChatCompletionsContentPart,
  ChatCompletionsMessage,
} from "../endpoints/chat-completions/schema";

type GenAIPart = Record<string, unknown>;

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

export const getRequestAttributes = (request?: Request) => {
  if (!request) return {};

  let url;
  try {
    // FUTURE: use URL from lifecycle
    url = new URL(request.url);
  } catch {}

  return {
    "http.request.id": resolveRequestId(request),
    "http.request.method": request.method,
    "url.full": request.url,
    "url.path": url?.pathname,
    "url.scheme": url?.protocol.replace(":", ""),
    // TODO: "url.query"
    "server.address": url?.hostname,
    "server.port": url?.port ? Number(url.port) : url?.protocol === "https:" ? 443 : 80,
    "http.request.header.content-type": [request.headers.get("content-type") ?? undefined],
    "http.request.header.content-length": [request.headers.get("content-length") ?? undefined],
    "user_agent.original": request.headers.get("user-agent") ?? undefined,
    // TODO: "client.address"
  };
};

export const getAIAttributes = (body?: object, result?: object) => {
  if (!body && !result) return {};

  const isChat = !!body && "messages" in body;
  const isEmbeddings = !!body && "input" in body;

  const attrs = {
    "gen_ai.operation.name": isEmbeddings ? "embeddings" : isChat ? "chat" : undefined,
    "gen_ai.request.model": body && "model" in body ? body.model : undefined,
    "gen_ai.response.model": result && "model" in result ? result.model : undefined,
    "gen_ai.response.id": result && "id" in result ? result.id : undefined,
  };

  if (isChat) {
    if (body) {
      const inputs = body as ChatCompletionsBody;
      Object.assign(attrs, {
        // FUTURE: only construct once
        "gen_ai.system_instructions": inputs.messages
          .filter((m) => m.role === "system")
          .map((m) => ({ parts: [toTextPart(m.content)] })),
        "gen_ai.input.messages": inputs.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, parts: toMessageParts(m) })),
        "gen_ai.tool.definitions": inputs.tools,
        "gen_ai.request.stream": inputs.stream,
        "gen_ai.request.seed": inputs.seed,
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

    // FUTURE: implement streaming
    if (result && !(result instanceof ReadableStream)) {
      const completions = result as ChatCompletions;
      Object.assign(attrs, {
        "gen_ai.output.type": "text",
        "gen_ai.usage.total_tokens": completions.usage?.total_tokens,
        "gen_ai.output.messages": completions.choices.map((c) => ({
          role: c.message.role,
          parts: toMessageParts(c.message),
          finish_reason: c.finish_reason,
        })),
        "gen_ai.response.finish_reasons": completions.choices.map((c) => c.finish_reason),
        "gen_ai.usage.input_tokens": completions.usage?.prompt_tokens,
        "gen_ai.usage.cached_tokens": completions.usage?.prompt_tokens_details?.cached_tokens,
        "gen_ai.usage.output_tokens": completions.usage?.completion_tokens,
        "gen_ai.usage.reasoning_tokens":
          completions.usage?.completion_tokens_details?.reasoning_tokens,
      });
    }
  }

  if (isEmbeddings) {
    if (body) {
      const inputs = body as EmbeddingsBody;
      Object.assign(attrs, {
        "gen_ai.embeddings.dimension.count": inputs.dimensions,
      });
    }

    if (result) {
      const embeddings = result as Embeddings;
      Object.assign(attrs, {
        "gen_ai.output.type": "embedding",
        "gen_ai.usage.input_tokens": embeddings.usage?.prompt_tokens,
        "gen_ai.usage.total_tokens": embeddings.usage?.total_tokens,
      });
    }
  }

  return attrs;
};

export const getResponseAttributes = (response?: Response) => {
  if (!response) return {};

  return {
    "http.response.status_code": response.status,
    "http.response.header.content-type": [response.headers.get("content-type") ?? undefined],
    "http.response.header.content-length": [response.headers.get("content-length") ?? undefined],
  };
};
