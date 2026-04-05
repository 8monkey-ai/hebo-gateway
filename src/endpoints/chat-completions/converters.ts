import type { SharedV3ProviderMetadata } from "@ai-sdk/provider";
import type {
  GenerateTextResult,
  StreamTextResult,
  FinishReason,
  ToolCallPart,
  ToolResultPart,
  ToolSet,
  ModelMessage,
  UserContent,
  AssistantContent,
  LanguageModelUsage,
  TextStreamPart,
  ReasoningOutput,
  AssistantModelMessage,
  ToolModelMessage,
  UserModelMessage,
  TextPart,
  ImagePart,
  FilePart,
} from "ai";

import { Output, jsonSchema, tool } from "ai";

import type {
  ChatCompletionsToolCall,
  ChatCompletionsTool,
  ChatCompletionsToolChoice,
  ChatCompletionsStream,
  ChatCompletionsContentPart,
  ChatCompletionsMessage,
  ChatCompletionsUserMessage,
  ChatCompletionsAssistantMessage,
  ChatCompletionsToolMessage,
  ChatCompletionsFinishReason,
  ChatCompletionsUsage,
  ChatCompletionsChoice,
  ChatCompletionsInputs,
  ChatCompletions,
  ChatCompletionsAssistantMessageDelta,
  ChatCompletionsChoiceDelta,
  ChatCompletionsChunk,
  ChatCompletionsToolCallDelta,
  ChatCompletionsReasoningDetail,
  ChatCompletionsResponseFormat,
  ChatCompletionsContentPartText,
  ChatCompletionsCacheControl,
} from "./schema";
import type { SseErrorFrame, SseFrame } from "../../utils/stream";

import { toResponse } from "../../utils/response";
import {
  parseJsonOrText,
  parseReasoningOptions,
  parsePromptCachingOptions,
  resolveResponseServiceTier,
  normalizeToolName,
  stripEmptyKeys,
  parseBase64,
  parseImageInput,
  extractReasoningMetadata,
  type TextCallOptions,
  type ToolChoiceOptions,
} from "../shared/converters";
import { GatewayError } from "../../errors/gateway";

// --- Request Flow ---

export function convertToTextCallOptions(params: ChatCompletionsInputs): TextCallOptions {
  const {
    messages,
    tools,
    tool_choice,
    temperature,
    max_tokens,
    max_completion_tokens,
    response_format,
    reasoning_effort,
    reasoning,
    prompt_cache_key,
    prompt_cache_retention,
    extra_body,
    cache_control,
    frequency_penalty,
    presence_penalty,
    seed,
    stop,
    top_p,
    ...rest
  } = params;

  Object.assign(rest, parseReasoningOptions(reasoning_effort, reasoning));
  Object.assign(
    rest,
    parsePromptCachingOptions(prompt_cache_key, prompt_cache_retention, cache_control),
  );

  if (extra_body) {
    for (const v of Object.values(extra_body)) {
      Object.assign(rest, v);
    }
  }

  const { toolChoice, activeTools } = convertToToolChoiceOptions(tool_choice);

  return {
    messages: convertToModelMessages(messages),
    tools: convertToToolSet(tools),
    toolChoice,
    activeTools,
    output: convertToOutput(response_format),
    temperature,
    maxOutputTokens: max_completion_tokens ?? max_tokens,
    frequencyPenalty: frequency_penalty,
    presencePenalty: presence_penalty,
    seed,
    stopSequences: stop ? (Array.isArray(stop) ? stop : [stop]) : undefined,
    topP: top_p,
    providerOptions: {
      unknown: rest,
    },
  };
}

function convertToOutput(responseFormat: ChatCompletionsResponseFormat | undefined) {
  if (!responseFormat || responseFormat.type === "text") {
    return;
  }

  const { name, description, schema } = responseFormat.json_schema;
  return Output.object({
    name,
    description,
    schema: jsonSchema(schema),
  });
}

export function convertToModelMessages(messages: ChatCompletionsMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  const toolById = indexToolMessages(messages);

  for (const message of messages) {
    if (message.role === "tool") continue;

    if (message.role === "system") {
      if (message.cache_control) {
        (message as ModelMessage).providerOptions = {
          unknown: { cache_control: message.cache_control },
        };
      }
      modelMessages.push(message);
      continue;
    }

    if (message.role === "user") {
      modelMessages.push(fromChatCompletionsUserMessage(message));
      continue;
    }

    modelMessages.push(fromChatCompletionsAssistantMessage(message));
    const toolResult = fromChatCompletionsToolResultMessage(message, toolById);
    if (toolResult) modelMessages.push(toolResult);
  }

  return modelMessages;
}

function indexToolMessages(messages: ChatCompletionsMessage[]) {
  const map = new Map<string, ChatCompletionsToolMessage>();
  for (const m of messages) {
    if (m.role === "tool") map.set(m.tool_call_id, m);
  }
  return map;
}

export function fromChatCompletionsUserMessage(
  message: ChatCompletionsUserMessage,
): UserModelMessage {
  const out: UserModelMessage = {
    role: "user",
    content: Array.isArray(message.content)
      ? fromChatCompletionsContent(message.content)
      : message.content,
  };
  if (message.cache_control) {
    out.providerOptions = {
      unknown: { cache_control: message.cache_control },
    };
  }
  return out;
}

export function fromChatCompletionsAssistantMessage(
  message: ChatCompletionsAssistantMessage,
): AssistantModelMessage {
  const { tool_calls, role, content, extra_content, reasoning_details, cache_control } = message;

  const parts: AssistantContent = [];

  if (reasoning_details?.length) {
    for (const detail of reasoning_details) {
      if (detail.text && detail.type === "reasoning.text") {
        parts.push({
          type: "reasoning",
          text: detail.text,
          providerOptions: detail.signature
            ? {
                unknown: {
                  signature: detail.signature,
                },
              }
            : undefined,
        });
      } else if (detail.type === "reasoning.encrypted" && detail.data) {
        parts.push({
          type: "reasoning",
          text: "",
          providerOptions: {
            unknown: {
              redactedData: detail.data,
            },
          },
        });
      }
    }
  }

  if (content !== undefined && content !== null) {
    const inputContent =
      typeof content === "string"
        ? ([{ type: "text", text: content }] as ChatCompletionsContentPartText[])
        : content;
    for (const part of inputContent) {
      if (part.type === "text") {
        const textPart: TextPart = {
          type: "text",
          text: part.text,
        };
        if (part.cache_control) {
          textPart.providerOptions = {
            unknown: { cache_control: part.cache_control },
          };
        }
        parts.push(textPart);
      }
    }
  }

  if (tool_calls?.length) {
    for (const tc of tool_calls) {
      // oxlint-disable-next-line no-shadow
      const { id, function: fn, extra_content } = tc;
      const out: ToolCallPart = {
        type: "tool-call",
        toolCallId: id,
        toolName: fn.name,
        input: parseJsonOrText(fn.arguments).value,
      };
      if (extra_content) {
        out.providerOptions = extra_content;
      }
      parts.push(out);
    }
  }

  const out: AssistantModelMessage = {
    role,
    content: parts.length > 0 ? parts : (content ?? ""),
  };

  if (extra_content) {
    out.providerOptions = extra_content;
  }

  if (cache_control) {
    (out.providerOptions ??= {})["unknown"] = { cache_control };
  }

  return out;
}

export function fromChatCompletionsToolResultMessage(
  message: ChatCompletionsAssistantMessage,
  toolById: Map<string, ChatCompletionsToolMessage>,
): ToolModelMessage | undefined {
  const toolCalls = message.tool_calls ?? [];
  if (toolCalls.length === 0) return undefined;

  const toolResultParts: ToolResultPart[] = [];
  for (const tc of toolCalls) {
    const toolMsg = toolById.get(tc.id);
    if (!toolMsg) continue;

    toolResultParts.push({
      type: "tool-result",
      toolCallId: tc.id,
      toolName: tc.function.name,
      output: parseToolResult(toolMsg.content),
    });
  }

  return toolResultParts.length > 0 ? { role: "tool", content: toolResultParts } : undefined;
}

export function fromChatCompletionsContent(content: ChatCompletionsContentPart[]): UserContent {
  return content.map((part) => {
    switch (part.type) {
      case "image_url":
        return fromImageUrlPart(part.image_url.url, part.cache_control);
      case "file":
        return fromFilePart(
          part.file.data,
          part.file.media_type,
          part.file.filename,
          part.cache_control,
        );
      case "input_audio":
        return fromFilePart(
          part.input_audio.data,
          `audio/${part.input_audio.format}`,
          undefined,
          part.cache_control,
        );
      case "text": {
        const out: TextPart = {
          type: "text" as const,
          text: part.text,
        };
        if (part.cache_control) {
          out.providerOptions = {
            unknown: { cache_control: part.cache_control },
          };
        }
        return out;
      }
      default:
        throw new GatewayError(`Unsupported content part type: ${(part as { type: string }).type}`, 400);
    }
  });
}

function fromImageUrlPart(url: string, cacheControl?: ChatCompletionsCacheControl) {
  const { image, mediaType } = parseImageInput(url);

  if (image instanceof URL) {
    const out: ImagePart = {
      type: "image" as const,
      image,
    };
    if (cacheControl) {
      out.providerOptions = {
        unknown: { cache_control: cacheControl },
      };
    }
    return out;
  }

  return fromFilePart(image, mediaType ?? "image/jpeg", undefined, cacheControl);
}

function fromFilePart(
  base64Data: string,
  mediaType: string,
  filename?: string,
  cacheControl?: ChatCompletionsCacheControl,
) {
  const data = parseBase64(base64Data);

  if (mediaType.startsWith("image/")) {
    const out: ImagePart = {
      type: "image" as const,
      image: data,
      mediaType,
    };
    if (cacheControl) {
      out.providerOptions = {
        unknown: { cache_control: cacheControl },
      };
    }
    return out;
  }

  const out: FilePart = {
    type: "file" as const,
    data: data,
    filename,
    mediaType,
  };
  if (cacheControl) {
    out.providerOptions = {
      unknown: { cache_control: cacheControl },
    };
  }
  return out;
}

export const convertToToolSet = (tools: ChatCompletionsTool[] | undefined): ToolSet | undefined => {
  if (!tools) {
    return;
  }

  const toolSet: ToolSet = {};
  for (const t of tools) {
    toolSet[t.function.name] = tool({
      description: t.function.description,
      inputSchema: jsonSchema(t.function.parameters),
      strict: t.function.strict,
    });
  }
  return toolSet;
};

export const convertToToolChoiceOptions = (
  toolChoice: ChatCompletionsToolChoice | undefined,
): ToolChoiceOptions => {
  if (!toolChoice) {
    return {};
  }

  if (toolChoice === "none" || toolChoice === "auto" || toolChoice === "required") {
    return { toolChoice };
  }

  // FUTURE: this is right now google specific, which is not supported by AI SDK, until then,
  // we temporarily map it to auto for now
  // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview
  if (toolChoice === "validated") {
    return { toolChoice: "auto" };
  }

  if (toolChoice.type === "allowed_tools") {
    return {
      toolChoice: toolChoice.allowed_tools.mode,
      activeTools: toolChoice.allowed_tools.tools.map((toolRef) => toolRef.function.name),
    };
  }

  return {
    toolChoice: {
      type: "tool",
      toolName: toolChoice.function.name,
    },
  };
};

function parseToolResult(
  content: string | ChatCompletionsContentPartText[],
): ToolResultPart["output"] {
  if (Array.isArray(content)) {
    return {
      type: "content",
      value: content.map((part) => ({
        type: "text",
        text: part.text,
      })),
    };
  }
  return parseJsonOrText(content);
}

// --- Response Flow ---

export function toChatCompletions(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
): ChatCompletions {
  return {
    id: "chatcmpl-" + crypto.randomUUID(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: toChatCompletionsAssistantMessage(result),
        finish_reason: toChatCompletionsFinishReason(result.finishReason),
      } satisfies ChatCompletionsChoice,
    ],
    usage: result.totalUsage ? toChatCompletionsUsage(result.totalUsage) : null,
    provider_metadata: result.providerMetadata,
    service_tier: resolveResponseServiceTier(result.providerMetadata),
  };
}

export function toChatCompletionsResponse(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toChatCompletions(result, model), responseInit);
}

export function toChatCompletionsStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
): ChatCompletionsStream {
  return result.fullStream.pipeThrough(new ChatCompletionsTransformStream(model));
}

export function toChatCompletionsStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toChatCompletionsStream(result, model), responseInit);
}

export class ChatCompletionsTransformStream extends TransformStream<
  TextStreamPart<ToolSet>,
  SseFrame<ChatCompletionsChunk> | SseErrorFrame
> {
  constructor(model: string) {
    const streamId = `chatcmpl-${crypto.randomUUID()}`;
    const creationTime = Math.floor(Date.now() / 1000);
    let toolCallIndexCounter = 0;
    const reasoningIdToIndex = new Map<string, number>();
    let finishProviderMetadata: SharedV3ProviderMetadata | undefined;

    const createChunk = (
      delta: ChatCompletionsAssistantMessageDelta,
      provider_metadata?: SharedV3ProviderMetadata,
      finish_reason?: ChatCompletionsFinishReason,
      usage?: ChatCompletionsUsage,
    ): SseFrame<ChatCompletionsChunk> => {
      if (provider_metadata) {
        delta.extra_content = provider_metadata;
      }

      return {
        data: {
          id: streamId,
          object: "chat.completion.chunk",
          created: creationTime,
          model,
          choices: [
            {
              index: 0,
              delta,
              finish_reason: finish_reason ?? null,
            } satisfies ChatCompletionsChoiceDelta,
          ],
          usage: usage ?? null,
          service_tier: resolveResponseServiceTier(provider_metadata),
        } satisfies ChatCompletionsChunk,
      };
    };

    super({
      transform(part, controller) {
        // Omit lifecycle (start/end) and intermediate events; /chat/completions
        // is a stateless stream of deltas. Tool calls are emitted once fully-formed.
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "text-delta": {
            controller.enqueue(
              createChunk({ role: "assistant", content: part.text }, part.providerMetadata),
            );
            break;
          }

          case "reasoning-delta": {
            let index = reasoningIdToIndex.get(part.id);
            if (index === undefined) {
              index = reasoningIdToIndex.size;
              reasoningIdToIndex.set(part.id, index);
            }

            controller.enqueue(
              createChunk(
                {
                  reasoning: part.text,
                  reasoning_details: [
                    toReasoningDetail(
                      {
                        type: "reasoning",
                        text: part.text,
                        providerMetadata: part.providerMetadata,
                      },
                      part.id,
                      index,
                    ),
                  ],
                },
                part.providerMetadata,
              ),
            );
            break;
          }

          case "tool-call": {
            const toolCall = toChatCompletionsToolCall(
              part.toolCallId,
              part.toolName,
              part.input,
              part.providerMetadata,
            ) as ChatCompletionsToolCallDelta;
            toolCall.index = toolCallIndexCounter++;
            controller.enqueue(
              createChunk({
                tool_calls: [toolCall],
              }),
            );
            break;
          }

          case "finish-step": {
            finishProviderMetadata = part.providerMetadata;
            break;
          }

          case "finish": {
            controller.enqueue(
              createChunk(
                {},
                finishProviderMetadata,
                toChatCompletionsFinishReason(part.finishReason),
                toChatCompletionsUsage(part.totalUsage),
              ),
            );
            break;
          }

          case "error": {
            controller.enqueue({
              data: part.error instanceof Error ? part.error : new Error(String(part.error)),
            });
          }
        }
      },
    });
  }
}

export const toChatCompletionsAssistantMessage = (
  result: GenerateTextResult<ToolSet, Output.Output>,
): ChatCompletionsAssistantMessage => {
  const message: ChatCompletionsAssistantMessage = {
    role: "assistant",
    content: null,
  };

  if (result.toolCalls && result.toolCalls.length > 0) {
    message.tool_calls = result.toolCalls.map((toolCall) =>
      toChatCompletionsToolCall(
        toolCall.toolCallId,
        toolCall.toolName,
        toolCall.input,
        toolCall.providerMetadata,
      ),
    );
  }

  const reasoningDetails: ChatCompletionsReasoningDetail[] = [];

  for (const part of result.content) {
    if (part.type === "text") {
      if (message.content === null) {
        message.content = part.text;
      } else {
        (message.content as string) += part.text;
      }
      if (part.providerMetadata) {
        message.extra_content = part.providerMetadata;
      }
    } else if (part.type === "reasoning") {
      reasoningDetails.push(
        toReasoningDetail(part, `reasoning-${crypto.randomUUID()}`, reasoningDetails.length),
      );
    }
  }

  if (result.reasoningText) {
    message.reasoning = result.reasoningText;
  }

  if (reasoningDetails.length > 0) {
    message.reasoning_details = reasoningDetails;
  }

  if (!message.content && !message.tool_calls) {
    // some models return just reasoning without tool calls or content
    message.content = "";
  }

  return message;
};

export function toReasoningDetail(
  reasoning: ReasoningOutput,
  id: string,
  index: number,
): ChatCompletionsReasoningDetail {
  const { redactedData, signature } = extractReasoningMetadata(reasoning.providerMetadata);

  if (redactedData) {
    return {
      id,
      index,
      type: "reasoning.encrypted",
      data: redactedData,
      format: "unknown",
    };
  }

  return {
    id,
    index,
    type: "reasoning.text",
    text: reasoning.text,
    signature,
    format: "unknown",
  };
}

export function toChatCompletionsUsage(usage: LanguageModelUsage): ChatCompletionsUsage {
  const out: ChatCompletionsUsage = {};

  const prompt = usage.inputTokens;
  if (prompt !== undefined) out.prompt_tokens = prompt;

  const completion = usage.outputTokens;
  if (completion !== undefined) out.completion_tokens = completion;

  if (prompt !== undefined || completion !== undefined || usage.totalTokens !== undefined) {
    out.total_tokens = usage.totalTokens ?? (prompt ?? 0) + (completion ?? 0);
  }

  const reasoning = usage.outputTokenDetails?.reasoningTokens;
  if (reasoning !== undefined) out.completion_tokens_details = { reasoning_tokens: reasoning };

  const cached = usage.inputTokenDetails?.cacheReadTokens;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens;
  if (cached !== undefined || cacheWrite !== undefined) {
    out.prompt_tokens_details = {};
    if (cached !== undefined) {
      out.prompt_tokens_details.cached_tokens = cached;
    }
    if (cacheWrite !== undefined) {
      out.prompt_tokens_details.cache_write_tokens = cacheWrite;
    }
  }

  return out;
}

export function toChatCompletionsToolCall(
  id: string,
  name: string,
  args: unknown,
  providerMetadata?: SharedV3ProviderMetadata,
): ChatCompletionsToolCall {
  const out: ChatCompletionsToolCall = {
    id,
    type: "function",
    function: {
      name: normalizeToolName(name),
      arguments: typeof args === "string" ? args : JSON.stringify(stripEmptyKeys(args)),
    },
  };

  if (providerMetadata) {
    out.extra_content = providerMetadata;
  }

  return out;
}

export const toChatCompletionsFinishReason = (
  finishReason: FinishReason,
): ChatCompletionsFinishReason => {
  if (finishReason === "error" || finishReason === "other") {
    return "stop";
  }
  return (finishReason as string).replaceAll("-", "_") as ChatCompletionsFinishReason;
};
