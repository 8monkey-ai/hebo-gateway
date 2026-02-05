import type { SharedV3ProviderOptions, SharedV3ProviderMetadata } from "@ai-sdk/provider";
import type {
  GenerateTextResult,
  StreamTextResult,
  FinishReason,
  ToolChoice,
  ToolCallPart,
  ToolResultPart,
  ToolSet,
  ModelMessage,
  UserContent,
  LanguageModelUsage,
  Output,
  TextStreamPart,
  AssistantModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from "ai";

import { jsonSchema, JsonToSseTransformStream, tool } from "ai";

import type {
  ChatCompletionsToolCall,
  ChatCompletionsTool,
  ChatCompletionsToolChoice,
  ChatCompletionsContentPart,
  ChatCompletionsMessage,
  ChatCompletionsSystemMessage,
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
  ChatCompletionsReasoningEffort,
  ChatCompletionsReasoningConfig,
} from "./schema";

import { GatewayError, OpenAIError, toOpenAIError } from "../../utils/errors";
import { mergeResponseInit } from "../../utils/response";

export type TextCallOptions = {
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  temperature?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  topP?: number;
  providerOptions: SharedV3ProviderOptions;
};

// --- Request Flow ---

export function convertToTextCallOptions(params: ChatCompletionsInputs): TextCallOptions {
  const {
    messages,
    tools,
    tool_choice,
    temperature,
    max_tokens,
    max_completion_tokens,
    reasoning_effort,
    reasoning,
    frequency_penalty,
    presence_penalty,
    seed,
    stop,
    top_p,
    ...rest
  } = params;

  return {
    messages: convertToModelMessages(messages),
    tools: convertToToolSet(tools),
    toolChoice: convertToToolChoice(tool_choice),
    temperature,
    maxOutputTokens: max_completion_tokens ?? max_tokens,
    frequencyPenalty: frequency_penalty,
    presencePenalty: presence_penalty,
    seed,
    stopSequences: stop ? (Array.isArray(stop) ? stop : [stop]) : undefined,
    topP: top_p,
    providerOptions: {
      unknown: {
        ...rest,
        ...parseReasoningOptions(reasoning_effort, reasoning),
      },
    },
  };
}

export function convertToModelMessages(messages: ChatCompletionsMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  const toolById = indexToolMessages(messages);

  for (const message of messages) {
    if (message.role === "tool") continue;

    if (message.role === "system") {
      modelMessages.push(message satisfies ChatCompletionsSystemMessage);
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
  return {
    role: "user",
    content: Array.isArray(message.content)
      ? fromChatCompletionsContent(message.content)
      : message.content,
  };
}

export function fromChatCompletionsAssistantMessage(
  message: ChatCompletionsAssistantMessage,
): AssistantModelMessage {
  const { tool_calls, role, content, extra_content } = message;

  if (!tool_calls?.length) {
    const out: AssistantModelMessage = {
      role: role,
      content: content ?? "",
    };
    if (extra_content) {
      out.providerOptions = extra_content;
    }
    return out;
  }

  return {
    role: role,
    content: tool_calls.map((tc: ChatCompletionsToolCall) => {
      const { id, function: fn, extra_content } = tc;
      const out: ToolCallPart = {
        type: "tool-call",
        toolCallId: id,
        toolName: fn.name,
        input: parseToolOutput(fn.arguments).value,
      };
      if (extra_content) {
        out.providerOptions = extra_content;
      }
      return out;
    }),
  };
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
      output: parseToolOutput(toolMsg.content),
    });
  }

  return toolResultParts.length > 0 ? { role: "tool", content: toolResultParts } : undefined;
}

export function fromChatCompletionsContent(content: ChatCompletionsContentPart[]): UserContent {
  return content.map((part) => {
    if (part.type === "image_url") {
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        const parts = url.split(",");
        const metadata = parts[0];
        const base64Data = parts[1];

        if (!metadata || !base64Data) {
          throw new GatewayError("Invalid data URL: missing metadata or data", 400);
        }

        const mimeTypePart = metadata.split(":")[1];
        if (!mimeTypePart) {
          throw new GatewayError("Invalid data URL: missing MIME type part", 400);
        }

        const mimeType = mimeTypePart.split(";")[0];
        if (!mimeType) {
          throw new GatewayError("Invalid data URL: missing MIME type", 400);
        }

        return mimeType.startsWith("image/")
          ? {
              type: "image" as const,
              image: Buffer.from(base64Data, "base64"),
              mediaType: mimeType,
            }
          : {
              type: "file" as const,
              data: Buffer.from(base64Data, "base64"),
              mediaType: mimeType,
            };
      }

      return {
        type: "image" as const,
        image: new URL(url),
      };
    }
    if (part.type === "file") {
      let { data, media_type, filename } = part.file;
      return media_type.startsWith("image/")
        ? {
            type: "image" as const,
            image: Buffer.from(data, "base64"),
            mediaType: media_type,
          }
        : {
            type: "file" as const,
            data: Buffer.from(data, "base64"),
            filename,
            mediaType: media_type,
          };
    }
    return part;
  });
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
    });
  }
  return toolSet;
};

export const convertToToolChoice = (
  toolChoice: ChatCompletionsToolChoice | undefined,
): ToolChoice<ToolSet> | undefined => {
  if (!toolChoice) {
    return undefined;
  }

  if (toolChoice === "none" || toolChoice === "auto" || toolChoice === "required") {
    return toolChoice;
  }

  return {
    type: "tool",
    toolName: toolChoice.function.name,
  };
};

function parseToolOutput(content: string) {
  try {
    return { type: "json" as const, value: JSON.parse(content) };
  } catch {
    return { type: "text" as const, value: content };
  }
}

function parseReasoningOptions(
  reasoning_effort: ChatCompletionsReasoningEffort | undefined,
  reasoning: ChatCompletionsReasoningConfig | undefined,
) {
  const effort = reasoning?.effort ?? reasoning_effort;
  const max_tokens = reasoning?.max_tokens;

  if (reasoning?.enabled === false || effort === "none") {
    return { reasoning: { enabled: false }, reasoning_effort: "none" };
  }
  if (!reasoning && effort === undefined) return {};

  const out: any = { reasoning: {} };

  if (effort) {
    out.reasoning.enabled = true;
    out.reasoning.effort = effort;
    out.reasoning_effort = effort;
  }
  if (max_tokens) {
    out.reasoning.enabled = true;
    out.reasoning.max_tokens = max_tokens;
  }
  if (out.reasoning.enabled) {
    out.reasoning.exclude = reasoning?.exclude;
  }

  return out;
}

// --- Response Flow ---

export function toChatCompletions(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
): ChatCompletions {
  const finish_reason = toChatCompletionsFinishReason(result.finishReason);

  return {
    id: "chatcmpl-" + crypto.randomUUID(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: toChatCompletionsAssistantMessage(result),
        finish_reason,
      } satisfies ChatCompletionsChoice,
    ],
    usage: result.totalUsage ? toChatCompletionsUsage(result.totalUsage) : null,
    provider_metadata: result.providerMetadata,
  };
}
export function toChatCompletionsResponse(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return new Response(
    JSON.stringify(toChatCompletions(result, model)),
    mergeResponseInit({ "Content-Type": "application/json" }, responseInit),
  );
}

export function toChatCompletionsStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
): ReadableStream<Uint8Array> {
  return result.fullStream
    .pipeThrough(new ChatCompletionsStream(model))
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream());
}

export function toChatCompletionsStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return new Response(
    toChatCompletionsStream(result, model),
    mergeResponseInit(
      {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      responseInit,
    ),
  );
}

export class ChatCompletionsStream extends TransformStream<
  TextStreamPart<ToolSet>,
  ChatCompletionsChunk | OpenAIError
> {
  constructor(model: string) {
    const streamId = `chatcmpl-${crypto.randomUUID()}`;
    const creationTime = Math.floor(Date.now() / 1000);
    let toolCallIndexCounter = 0;

    const createChunk = (
      delta: ChatCompletionsAssistantMessageDelta,
      provider_metadata?: SharedV3ProviderMetadata,
      finish_reason?: ChatCompletionsFinishReason,
      usage?: ChatCompletionsUsage,
    ): ChatCompletionsChunk => {
      if (provider_metadata) {
        delta.extra_content = provider_metadata;
      }
      return {
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
      };
    };

    super({
      transform(part, controller) {
        switch (part.type) {
          case "text-delta": {
            controller.enqueue(
              createChunk({ role: "assistant", content: part.text }, part.providerMetadata),
            );
            break;
          }

          case "reasoning-delta": {
            controller.enqueue(
              createChunk({ reasoning_content: part.text }, part.providerMetadata),
            );
            break;
          }

          case "tool-call": {
            controller.enqueue(
              createChunk({
                tool_calls: [
                  {
                    ...toChatCompletionsToolCall(
                      part.toolCallId,
                      part.toolName,
                      part.input,
                      part.providerMetadata,
                    ),
                    index: toolCallIndexCounter++,
                  } satisfies ChatCompletionsToolCallDelta,
                ],
              }),
            );
            break;
          }

          case "finish-step": {
            controller.enqueue(
              createChunk(
                {},
                part.providerMetadata,
                toChatCompletionsFinishReason(part.finishReason),
                toChatCompletionsUsage(part.usage),
              ),
            );
            break;
          }

          case "finish": {
            controller.enqueue(
              createChunk(
                {},
                undefined,
                toChatCompletionsFinishReason(part.finishReason),
                toChatCompletionsUsage(part.totalUsage),
              ),
            );
            break;
          }

          case "error": {
            const error = part.error;
            // FUTURE: logging
            controller.enqueue(toOpenAIError(error));
            break;
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

  for (const part of result.content) {
    if (part.type === "text") {
      message.content = part.text;
      if (part.providerMetadata) {
        message.extra_content = part.providerMetadata;
      }
      break;
    }
  }

  if (result.reasoningText) {
    message.reasoning_content = result.reasoningText;
  }

  return message;
};

export function toChatCompletionsUsage(usage: LanguageModelUsage): ChatCompletionsUsage {
  return {
    ...(usage.inputTokens !== undefined && {
      prompt_tokens: usage.inputTokens,
    }),
    ...(usage.outputTokens !== undefined && {
      completion_tokens: usage.outputTokens,
    }),
    ...((usage.totalTokens !== undefined ||
      usage.inputTokens !== undefined ||
      usage.outputTokens !== undefined) && {
      total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    }),
    ...(usage.outputTokenDetails?.reasoningTokens !== undefined && {
      completion_tokens_details: {
        reasoning_tokens: usage.outputTokenDetails.reasoningTokens,
      },
    }),
    ...(usage.inputTokenDetails?.cacheReadTokens !== undefined && {
      prompt_tokens_details: {
        cached_tokens: usage.inputTokenDetails.cacheReadTokens,
      },
    }),
  };
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
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args),
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
