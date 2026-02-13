import type { Embeddings, EmbeddingsBody } from "#/endpoints/embeddings";

import { resolveRequestId } from "#/utils/headers";

import type { ChatCompletions, ChatCompletionsBody } from "../endpoints/chat-completions/schema";

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
    // FUTURE "url.query"
    "server.address": url?.hostname,
    "server.port": url?.port ? Number(url.port) : url?.protocol === "https:" ? 443 : 80,
    "http.request.header.content-type": [request.headers.get("content-type") ?? undefined],
    "http.request.header.content-length": [request.headers.get("content-length") ?? undefined],
    "user_agent.original": request.headers.get("user-agent") ?? undefined,
    // FUTURE: "client.address"
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
    const inputs = body as ChatCompletionsBody;
    if (inputs) {
      Object.assign(attrs, {
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
        "gen_ai.tool.definitions": inputs.tools,
      });
      // TODO: "gen_ai.system_instructions": system
      // TODO: "gen_ai.input.messages": user, assistant, tool
    }

    // FUTURE: implement streaming
    const completions = result as ChatCompletions;
    if (completions && !(completions instanceof ReadableStream)) {
      Object.assign(attrs, {
        "gen_ai.output.type": "text",
        "gen_ai.response.finish_reasons": completions.choices.map((c) => c.finish_reason),
        "gen_ai.usage.input_tokens": completions.usage?.prompt_tokens,
        "gen_ai.usage.cached_tokens": completions.usage?.prompt_tokens_details?.cached_tokens,
        "gen_ai.usage.output_tokens": completions.usage?.completion_tokens,
        "gen_ai.usage.reasoning_tokens":
          completions.usage?.completion_tokens_details?.reasoning_tokens,
        "gen_ai.usage.total_tokens": completions.usage?.total_tokens,
      });
      // TODO: "gen_ai.output.messages": assistant
    }
  }

  if (isEmbeddings) {
    const inputs = body as EmbeddingsBody;
    if (inputs) {
      Object.assign(attrs, {
        "gen_ai.embeddings.dimension.count": inputs.dimensions,
      });
    }

    const embeddings = result as Embeddings;
    if (embeddings) {
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
