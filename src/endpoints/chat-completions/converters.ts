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
  AssistantContent,
  LanguageModelUsage,
  Output,
  TextStreamPart,
  ReasoningOutput,
  AssistantModelMessage,
  ToolModelMessage,
  UserModelMessage,
} from "ai";

import { convertBase64ToUint8Array } from "@ai-sdk/provider-utils";
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
  ChatCompletionsAssistantMessageDelta,
  ChatCompletionsChoiceDelta,
  ChatCompletionsChunk,
  ChatCompletionsToolCallDelta,
  ChatCompletionsReasoningEffort,
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningDetail,
} from "./schema";

import { GatewayError } from "../../errors/gateway";
import { OpenAIError, toOpenAIError } from "../../errors/openai";
import { toResponse } from "../../utils/response";

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

  Object.assign(rest, parseReasoningOptions(reasoning_effort, reasoning));

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
      unknown: rest,
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
  const { tool_calls, role, content, extra_content, reasoning_details } = message;

  const parts: AssistantContent = [];

  if (Array.isArray(parts)) {
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

    if (tool_calls?.length) {
      for (const tc of tool_calls) {
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
        parts.push(out);
      }
    } else if (content !== undefined && content !== null) {
      parts.push({
        type: "text",
        text: content,
      });
    }
  }

  const out: AssistantModelMessage = {
    role: role,
    content: Array.isArray(parts) && parts.length > 0 ? parts : (content ?? ""),
  };

  if (extra_content) {
    out.providerOptions = extra_content;
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
        const { mimeType, base64Data } = parseDataUrl(url);

        return mimeType.startsWith("image/")
          ? {
              type: "image" as const,
              image: convertBase64ToUint8Array(base64Data),
              mediaType: mimeType,
            }
          : {
              type: "file" as const,
              data: convertBase64ToUint8Array(base64Data),
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
            image: convertBase64ToUint8Array(data),
            mediaType: media_type,
          }
        : {
            type: "file" as const,
            data: convertBase64ToUint8Array(data),
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

function parseDataUrl(url: string): { mimeType: string; base64Data: string } {
  const commaIndex = url.indexOf(",");
  if (commaIndex <= "data:".length || commaIndex === url.length - 1) {
    throw new GatewayError("Invalid data URL: missing metadata or data", 400);
  }

  const metadata = url.slice("data:".length, commaIndex);
  const base64Data = url.slice(commaIndex + 1);

  const semicolonIndex = metadata.indexOf(";");
  const mimeType = (semicolonIndex === -1 ? metadata : metadata.slice(0, semicolonIndex)).trim();
  if (!mimeType) {
    throw new GatewayError("Invalid data URL: missing MIME type", 400);
  }

  return { mimeType, base64Data };
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
  return toResponse(toChatCompletions(result, model), responseInit);
}

export function toChatCompletionsStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
): ReadableStream<ChatCompletionsChunk | OpenAIError> {
  return result.fullStream.pipeThrough(new ChatCompletionsStream(model));
}

export function toChatCompletionsStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toChatCompletionsStream(result, model), responseInit);
}

export class ChatCompletionsStream extends TransformStream<
  TextStreamPart<ToolSet>,
  ChatCompletionsChunk | OpenAIError
> {
  constructor(model: string) {
    const streamId = `chatcmpl-${crypto.randomUUID()}`;
    const creationTime = Math.floor(Date.now() / 1000);
    let toolCallIndexCounter = 0;
    const reasoningIdToIndex = new Map<string, number>();

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
            let index = reasoningIdToIndex.get(part.id);
            if (index === undefined) {
              index = reasoningIdToIndex.size;
              reasoningIdToIndex.set(part.id, index);
            }

            controller.enqueue(
              createChunk(
                {
                  reasoning_content: part.text,
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
            // FUTURE mask in production mode and return responseID
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

  const reasoningDetails: ChatCompletionsReasoningDetail[] = [];

  for (const part of result.content) {
    if (part.type === "text") {
      if (message.content === null) {
        message.content = part.text;
        if (part.providerMetadata) {
          message.extra_content = part.providerMetadata;
        }
      }
    } else if (part.type === "reasoning") {
      reasoningDetails.push(
        toReasoningDetail(part, `reasoning-${crypto.randomUUID()}`, reasoningDetails.length),
      );
    }
  }

  if (result.reasoningText) {
    message.reasoning_content = result.reasoningText;

    if (reasoningDetails.length === 0) {
      reasoningDetails.push(
        toReasoningDetail(
          { type: "reasoning", text: result.reasoningText },
          `reasoning-${crypto.randomUUID()}`,
          0,
        ),
      );
    }
  }

  if (reasoningDetails.length > 0) {
    message.reasoning_details = reasoningDetails;
  }

  return message;
};

export function toReasoningDetail(
  reasoning: ReasoningOutput,
  id: string,
  index: number,
): ChatCompletionsReasoningDetail {
  const providerMetadata = reasoning.providerMetadata ?? {};

  let redactedData: string | undefined;
  let signature: string | undefined;

  for (const metadata of Object.values(providerMetadata)) {
    if (metadata && typeof metadata === "object") {
      if ("redactedData" in metadata && typeof metadata["redactedData"] === "string") {
        redactedData = metadata["redactedData"];
      }
      if ("signature" in metadata && typeof metadata["signature"] === "string") {
        signature = metadata["signature"];
      }
    }
  }

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
  if (cached !== undefined) out.prompt_tokens_details = { cached_tokens: cached };

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
