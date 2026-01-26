import type {
  GenerateTextResult,
  StreamTextResult,
  FinishReason,
  ToolChoice,
  ToolResultPart,
  ToolSet,
  ModelMessage,
} from "ai";

import { jsonSchema, tool } from "ai";

import type {
  OpenAICompatibleAssistantMessage,
  OpenAICompatibleChatCompletionsParams,
  OpenAICompatibleChatCompletionsResponseBody,
  OpenAICompatibleContentPart,
  OpenAICompatibleFinishReason,
  OpenAICompatibleMessage,
  OpenAICompatibleMessageToolCall,
  OpenAICompatibleTool,
  OpenAICompatibleToolChoice,
  OpenAICompatibleUserMessage,
  OpenAICompatibleToolMessage,
} from "./schema";

import { toOpenAICompatibleError } from "../../utils/errors";

export type VercelAIChatCompletionsModelParams = {
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<any>;
  temperature?: number;
  providerOptions: Record<string, unknown>;
};

// --- Request Conversion Flow ---

export function fromOpenAICompatibleChatCompletionsParams(
  params: OpenAICompatibleChatCompletionsParams,
): VercelAIChatCompletionsModelParams {
  const { messages, tools, tool_choice, temperature = 1, ...rest } = params;

  return {
    messages: fromOpenAICompatibleMessages(messages),
    tools: fromOpenAICompatibleTools(tools),
    toolChoice: fromOpenAICompatibleToolChoice(tool_choice),
    temperature,
    providerOptions: rest,
  };
}

export function fromOpenAICompatibleMessages(messages: OpenAICompatibleMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  const toolById = indexToolMessages(messages);

  for (const message of messages) {
    if (message.role === "tool") continue;

    if (message.role === "system") {
      modelMessages.push(message as ModelMessage);
      continue;
    }

    if (message.role === "user") {
      modelMessages.push(fromOpenAICompatibleUserMessage(message));
      continue;
    }

    modelMessages.push(fromOpenAICompatibleAssistantMessage(message));
    const toolResult = fromOpenAICompatibleToolResultMessage(message, toolById);
    if (toolResult) modelMessages.push(toolResult);
  }

  return modelMessages;
}

function indexToolMessages(messages: OpenAICompatibleMessage[]) {
  const map = new Map<string, OpenAICompatibleToolMessage>();
  for (const m of messages) {
    if (m.role === "tool") map.set(m.tool_call_id, m);
  }
  return map;
}

export function fromOpenAICompatibleUserMessage(
  message: OpenAICompatibleUserMessage,
): ModelMessage {
  if (Array.isArray(message.content)) {
    return { role: "user", content: fromOpenAICompatibleContent(message.content) as any };
  }
  return message as ModelMessage;
}

export function fromOpenAICompatibleAssistantMessage(
  message: OpenAICompatibleAssistantMessage,
): ModelMessage {
  const { tool_calls, role, content } = message;

  if (!tool_calls || tool_calls.length === 0) {
    return {
      role: role,
      content: content as string | null,
    } as ModelMessage;
  }

  return {
    role: role,
    content: tool_calls.map((tc: OpenAICompatibleMessageToolCall) => {
      const { id, function: fn } = tc;
      return {
        type: "tool-call",
        toolCallId: id,
        toolName: fn.name,
        input: parseToolOutput(fn.arguments).value,
      };
    }),
  } as ModelMessage;
}

export function fromOpenAICompatibleToolResultMessage(
  message: OpenAICompatibleAssistantMessage,
  toolById: Map<string, OpenAICompatibleToolMessage>,
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
      output: parseToolOutput(toolMsg.content as string),
    });
  }

  return toolResultParts.length > 0
    ? ({ role: "tool", content: toolResultParts } as ModelMessage)
    : undefined;
}

export function fromOpenAICompatibleContent(content: OpenAICompatibleContentPart[]) {
  return content.map((part) => {
    if (part.type === "image_url") {
      const url = part.image_url.url;
      if (url.startsWith("data:")) {
        const parts = url.split(",");
        if (parts.length < 2) return part;

        const metadata = parts[0];
        const base64Data = parts[1];
        if (!metadata || !base64Data) return part;

        const mimeTypePart = metadata.split(":")[1];
        if (!mimeTypePart) return part;

        const mimeType = mimeTypePart.split(";")[0];
        if (!mimeType) return part;

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

export const fromOpenAICompatibleTools = (
  tools: OpenAICompatibleTool[] | undefined,
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

export const fromOpenAICompatibleToolChoice = (
  toolChoice: OpenAICompatibleToolChoice | undefined,
): ToolChoice<any> | undefined => {
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

// --- Response Conversion Flow ---

export function toOpenAICompatibleChatCompletionsResponse(
  result: GenerateTextResult<any, any>,
  model: string,
): Response {
  const finish_reason = toOpenAICompatibleFinishReason(result.finishReason);

  const body: OpenAICompatibleChatCompletionsResponseBody = {
    id: "chatcmpl-" + crypto.randomUUID(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: toOpenAICompatibleMessage(result),
        finish_reason,
      },
    ],
    usage: result.usage && toOpenAICompatibleUsage(result.usage),
    providerMetadata: result.providerMetadata,
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

export function toOpenAICompatibleStreamResponse(
  result: StreamTextResult<any, any>,
  model: string,
): Response {
  const stream = result.fullStream
    .pipeThrough(toOpenAICompatibleTransform(model))
    .pipeThrough(toSSETransform())
    .pipeThrough(new TextEncoderStream());

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function toOpenAICompatibleTransform(model: string): TransformStream<any, any> {
  const streamId = `chatcmpl-${crypto.randomUUID()}`;
  const creationTime = Math.floor(Date.now() / 1000);
  let toolCallIndexCounter = 0;

  const createChunk = (delta: any, finish_reason: any = null, usage?: any) => ({
    id: streamId,
    object: "chat.completion.chunk",
    created: creationTime,
    model,
    choices: [{ index: 0, delta, finish_reason }],
    ...(usage ? { usage } : {}),
  });

  return new TransformStream({
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
                  ...toOpenAICompatibleToolCall(part.toolCallId, part.toolName, part.input),
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
              toOpenAICompatibleFinishReason(part.finishReason),
              toOpenAICompatibleUsage(part.totalUsage),
            ),
          );
          break;
        }

        case "error": {
          const error = part.error;
          const msg = error instanceof Error ? error.message : String(error);
          const e = error as { code?: string; status?: number };
          controller.enqueue(
            toOpenAICompatibleError(
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

export function toSSETransform(): TransformStream<any, string> {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
    },
    flush(controller) {
      controller.enqueue("data: [DONE]\n\n");
    },
  });
}

export const toOpenAICompatibleMessage = (
  result: GenerateTextResult<any, any>,
): OpenAICompatibleAssistantMessage => {
  const message: OpenAICompatibleAssistantMessage = {
    role: "assistant",
    content: null,
  };

  if (result.toolCalls && result.toolCalls.length > 0) {
    message.tool_calls = result.toolCalls.map((toolCall) =>
      toOpenAICompatibleToolCall(toolCall.toolCallId, toolCall.toolName, toolCall.input),
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

export function toOpenAICompatibleUsage(
  usage:
    | {
        inputTokens: number;
        outputTokens: number;
        totalTokens?: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }
    | undefined,
): OpenAICompatibleChatCompletionsUsage | undefined {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.inputTokens ?? 0,
    completion_tokens: usage.outputTokens ?? 0,
    total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    completion_tokens_details: {
      reasoning_tokens: usage.reasoningTokens ?? 0,
    },
    prompt_tokens_details: {
      cached_tokens: usage.cachedInputTokens ?? 0,
    },
  };
}

export function toOpenAICompatibleToolCall(
  id: string,
  name: string,
  args: any,
): OpenAICompatibleMessageToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args),
    },
  };
}

export const toOpenAICompatibleFinishReason = (
  finishReason: FinishReason,
): OpenAICompatibleFinishReason => {
  if (finishReason === "error" || finishReason === "other") {
    return "stop";
  }
  return (finishReason as string).replaceAll("-", "_") as OpenAICompatibleFinishReason;
};
