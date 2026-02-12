import type { Embeddings, EmbeddingsInputs } from "#/endpoints/embeddings";

import { resolveRequestId } from "#/utils/headers";

import type { ChatCompletions, ChatCompletionsInputs } from "../endpoints/chat-completions/schema";
import type { GatewayContext } from "../types";

const getHeader = (headers: Headers, name: string) => headers.get(name) ?? undefined;

const getUrlParts = (request: Request) => {
  try {
    // FUTURE: optimize
    return new URL(request.url);
  } catch {
    return;
  }
};

const toGenAIOperationName = (operation?: GatewayContext["operation"]) =>
  operation === "embeddings" ? "embeddings" : operation === "text" ? "chat" : undefined;

export const getRequestAttributes = (request?: Request) => {
  if (!request) return {};

  const url = getUrlParts(request);

  return {
    "http.request.id": resolveRequestId(request),
    "http.request.method": request.method,
    "url.full": request.url,
    "url.path": url?.pathname,
    "url.scheme": url?.protocol.replace(":", ""),
    // FUTURE url.query
    "server.address": url?.hostname,
    "server.port": url?.port ? Number(url.port) : url?.protocol === "https:" ? 443 : 80,
    "http.request.header.content-type": [getHeader(request.headers, "content-type")],
    "http.request.header.content-length": [getHeader(request.headers, "content-length")],
    "user_agent.original": getHeader(request.headers, "user-agent"),
    // FUTURE: client.address
  };
};

// FUTURE: check with Gen AI
export const getAIAttributes = (context?: Partial<GatewayContext>) => {
  if (!context) return {};

  const responseId = context.result && "id" in context.result ? context.result.id : undefined;

  const attrs = {
    "gen_ai.operation.name": toGenAIOperationName(context.operation),
    "gen_ai.request.model": context.modelId,
    "gen_ai.response.model": context.resolvedModelId,
    "gen_ai.provider.name": context.resolvedProviderId,
    "gen_ai.response.id": responseId,
  };

  if (context.operation === "text") {
    const inputs = context.body as ChatCompletionsInputs;
    const completions = context.result as ChatCompletions;

    Object.assign(attrs, {
      "gen_ai.output.type": "text",

      "gen_ai.request.seed": inputs?.seed,
      "gen_ai.request.frequency_penalty": inputs?.frequency_penalty,
      "gen_ai.request.max_tokens": inputs?.max_completion_tokens,
      "gen_ai.request.presence_penalty": inputs?.presence_penalty,
      "gen_ai.request.stop_sequences": inputs?.stop
        ? Array.isArray(inputs.stop)
          ? inputs.stop
          : [inputs.stop]
        : undefined,
      "gen_ai.request.temperature": inputs?.temperature,
      "gen_ai.request.top_p": inputs?.top_p,
      "gen_ai.tool.definitions": inputs?.tools,

      "gen_ai.response.finish_reasons": completions?.choices.map((c) => c.finish_reason),
      "gen_ai.usage.input_tokens": completions?.usage?.prompt_tokens,
      "gen_ai.usage.cached_tokens": completions?.usage?.prompt_tokens_details?.cached_tokens,
      "gen_ai.usage.output_tokens": completions?.usage?.completion_tokens,
      "gen_ai.usage.reasoning_tokens":
        completions.usage?.completion_tokens_details?.reasoning_tokens,
      "gen_ai.usage.total_tokens": completions?.usage?.total_tokens,
    });

    // TODO: gen_ai.input.messages: user, assistant, tool
    // TODO: gen_ai.output.messages: assistant
    // TODO: gen_ai.system_instructions: system
  }

  if (context.operation === "embeddings") {
    const embeddingsInputs = context.body as EmbeddingsInputs;
    const embeddingsUsage = context.result as Embeddings;

    Object.assign(attrs, {
      "gen_ai.output.type": "embedding",

      "gen_ai.embeddings.dimension.count": embeddingsInputs?.dimensions,

      "gen_ai.usage.input_tokens": embeddingsUsage?.usage?.prompt_tokens,
      "gen_ai.usage.total_tokens": embeddingsUsage?.usage?.total_tokens,
    });
  }

  return attrs;
};

export const getResponseAttributes = (result?: Response) => {
  if (!result) return {};

  return {
    "http.response.status_code": result.status,
    "http.response.header.content-type": [getHeader(result.headers, "content-type")],
    "http.response.header.content-length": [getHeader(result.headers, "content-length")],
  };
};
