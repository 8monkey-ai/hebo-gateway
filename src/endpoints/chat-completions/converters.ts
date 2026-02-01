import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type {
  GenerateTextResult,
  StreamTextResult,
  FinishReason,
  ToolChoice,
  ToolResultPart,
  ToolSet,
  ModelMessage,
  UserContent,
  LanguageModelUsage,
  Output,
} from "ai";

import { jsonSchema, tool } from "ai";

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
} from "./schema";

import { OpenAIError } from "../../utils/errors";

export type TextCallOptions = {
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  temperature?: number;
  maxOutputTokens?: number;
  providerOptions: ProviderOptions;
};

// --- Request Flow ---

export function convertToTextCallOptions(params: ChatCompletionsInputs): TextCallOptions {
  const {
    messages,
    tools,
    tool_choice,
    temperature = 1,
    max_tokens,
    max_completion_tokens,
    reasoning_effort,
    ...rest
  } = params;

  if (reasoning_effort) {
    rest.reasoning = { effort: reasoning_effort };
  }

  return {
    messages: fromChatCompletionsMessages(messages),
    tools: fromChatCompletionsTools(tools),
    toolChoice: fromChatCompletionsToolChoice(tool_choice),
    temperature,
    maxOutputTokens: max_completion_tokens ?? max_tokens,
    providerOptions: {
      unknown: rest,
    },
  };
}

export function fromChatCompletionsMessages(messages: ChatCompletionsMessage[]): ModelMessage[] {
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

export function fromChatCompletionsUserMessage(message: ChatCompletionsUserMessage): ModelMessage {
  return {
    role: "user",
    content: Array.isArray(message.content)
      ? fromChatCompletionsContent(message.content)
      : message.content,
  };
}

export function fromChatCompletionsAssistantMessage(
  message: ChatCompletionsAssistantMessage,
): ModelMessage {
  const { tool_calls, role, content } = message;

  if (!tool_calls || tool_calls.length === 0) {
    return {
      role: role,
      content: content ?? "",
    };
  }

  return {
    role: role,
    content: tool_calls.map((tc: ChatCompletionsToolCall) => {
      const { id, function: fn } = tc;
      return {
        type: "tool-call",
        toolCallId: id,
        toolName: fn.name,
        input: parseToolOutput(fn.arguments).value,
      };
    }),
  };
}

export function fromChatCompletionsToolResultMessage(
  message: ChatCompletionsAssistantMessage,
  toolById: Map<string, ChatCompletionsToolMessage>,
): ModelMessage | undefined {
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
          throw new OpenAIError("Invalid data URL: missing metadata or data");
        }

        const mimeTypePart = metadata.split(":")[1];
        if (!mimeTypePart) {
          throw new OpenAIError("Invalid data URL: missing MIME type part");
        }

        const mimeType = mimeTypePart.split(";")[0];
        if (!mimeType) {
          throw new OpenAIError("Invalid data URL: missing MIME type");
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
      const { data, media_type } = part.file;
      return media_type.startsWith("image/")
        ? {
            type: "image" as const,
            image: Buffer.from(data, "base64"),
            mediaType: media_type,
          }
        : {
            type: "file" as const,
            data: Buffer.from(data, "base64"),
            mediaType: media_type,
          };
    }
    return part;
  });
}

export const fromChatCompletionsTools = (
  tools: ChatCompletionsTool[] | undefined,
): ToolSet | undefined => {
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

export const fromChatCompletionsToolChoice = (
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
        message: toChatCompletionsMessage(result),
        finish_reason,
      } satisfies ChatCompletionsChoice,
    ],
    usage: result.usage && toChatCompletionsUsage(result.usage),
    provider_metadata: result.providerMetadata,
  };
}
export function createChatCompletionsResponse(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(toChatCompletions(result, model)), {
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function toChatCompletionsStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
): ReadableStream<Uint8Array> {
  return result.fullStream
    .pipeThrough(new ChatCompletionsStream(model))
    .pipeThrough(new SSETransformStream())
    .pipeThrough(new TextEncoderStream());
}

export function createChatCompletionsStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  headers?: Record<string, string>,
): Response {
  return new Response(toChatCompletionsStream(result, model), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...headers,
    },
  });
}

export class ChatCompletionsStream extends TransformStream {
  constructor(model: string) {
    const streamId = `chatcmpl-${crypto.randomUUID()}`;
    const creationTime = Math.floor(Date.now() / 1000);
    let toolCallIndexCounter = 0;

    const createChunk = (
      delta: unknown,
      finish_reason?: ChatCompletionsFinishReason,
      usage?: ChatCompletionsUsage,
    ) => ({
      id: streamId,
      object: "chat.completion.chunk",
      created: creationTime,
      model,
      choices: [{ index: 0, delta, finish_reason }],
      ...(usage ? { usage } : {}),
    });

    super({
      transform(part, controller) {
        switch (part.type) {
          case "text-delta": {
            controller.enqueue(createChunk({ role: "assistant", content: part.text }));
            break;
          }

          case "reasoning-delta": {
            controller.enqueue(createChunk({ reasoning_content: part.text }));
            break;
          }

          case "tool-call": {
            controller.enqueue(
              createChunk({
                tool_calls: [
                  {
                    ...toChatCompletionsToolCall(part.toolCallId, part.toolName, part.input),
                    index: toolCallIndexCounter++,
                  },
                ],
              }),
            );
            break;
          }

          case "finish": {
            controller.enqueue(
              createChunk(
                {},
                toChatCompletionsFinishReason(part.finishReason),
                toChatCompletionsUsage(part.totalUsage),
              ),
            );
            break;
          }

          case "error": {
            const error = part.error;
            const msg = error instanceof Error ? error.message : String(error);
            const e = error as { code?: string; status?: number };
            controller.enqueue(
              new OpenAIError(
                msg,
                e.status && e.status < 500 ? "invalid_request_error" : "server_error",
                e.code,
              ),
            );
            break;
          }
        }
      },
    });
  }
}

export class SSETransformStream extends TransformStream {
  constructor() {
    super({
      transform(chunk, controller) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
      },
      flush(controller) {
        controller.enqueue("data: [DONE]\n\n");
      },
    });
  }
}

export const toChatCompletionsMessage = (
  result: GenerateTextResult<ToolSet, Output.Output>,
): ChatCompletionsAssistantMessage => {
  const message: ChatCompletionsAssistantMessage = {
    role: "assistant",
    content: null,
  };

  if (result.toolCalls && result.toolCalls.length > 0) {
    message.tool_calls = result.toolCalls.map((toolCall) =>
      toChatCompletionsToolCall(toolCall.toolCallId, toolCall.toolName, toolCall.input),
    );
  }

  for (const part of result.content) {
    if (part.type === "text") {
      message.content = part.text;
      break;
    }
  }

  if (result.reasoningText) {
    message.reasoning_content = result.reasoningText;
  }

  return message;
};

export function toChatCompletionsUsage(
  usage: LanguageModelUsage | undefined,
): ChatCompletionsUsage | undefined {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.inputTokens ?? 0,
    completion_tokens: usage.outputTokens ?? 0,
    total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    completion_tokens_details: {
      reasoning_tokens: usage.outputTokenDetails.reasoningTokens ?? 0,
    },
    prompt_tokens_details: {
      cached_tokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    },
  };
}

export function toChatCompletionsToolCall(
  id: string,
  name: string,
  args: unknown,
): ChatCompletionsToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args),
    },
  };
}

export const toChatCompletionsFinishReason = (
  finishReason: FinishReason,
): ChatCompletionsFinishReason => {
  if (finishReason === "error" || finishReason === "other") {
    return "stop";
  }
  return (finishReason as string).replaceAll("-", "_") as ChatCompletionsFinishReason;
};
