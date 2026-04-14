import type {
  GenerateTextResult,
  StreamTextResult,
  FinishReason,
  ToolSet,
  ModelMessage,
  UserContent,
  AssistantContent,
  LanguageModelUsage,
  TextStreamPart,
  AssistantModelMessage,
  ToolModelMessage,
  UserModelMessage,
  ImagePart,
  FilePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ReasoningOutput,
} from "ai";
import { Output, jsonSchema, tool } from "ai";

import {
  parseBase64,
  parseImageInput,
  parsePromptCachingOptions,
  normalizeToolName,
  stripEmptyKeys,
  resolveResponseServiceTier,
  extractReasoningMetadata,
  parseJsonOrText,
  type TextCallOptions,
} from "../shared/converters";
import type { ReasoningConfig, ReasoningEffort, CacheControl } from "../shared/schema";
import type {
  MessagesInputs,
  MessagesMessage,
  UserContentBlock,
  MessagesTool,
  MessagesToolChoice,
  MessagesThinkingConfig,
  MessagesOutputConfig,
  Messages,
  MessagesResponseContentBlock,
  MessagesStopReason,
  MessagesUsage,
  MessagesStream,
  MessagesStreamEvent,
} from "./schema";

// --- Request Flow ---

export function convertToTextCallOptions(inputs: MessagesInputs): TextCallOptions {
  const options: TextCallOptions = {
    messages: convertToModelMessages(inputs.messages, inputs.system),
    temperature: inputs.temperature,
    maxOutputTokens: inputs.max_tokens,
    topP: inputs.top_p,
    stopSequences: inputs.stop_sequences,
    providerOptions: {},
  };

  // Tools
  const toolSet = convertToToolSet(inputs.tools);
  if (toolSet) options.tools = toolSet;

  const toolChoice = convertToToolChoiceOptions(inputs.tool_choice);
  if (toolChoice) options.toolChoice = toolChoice;

  // Build providerOptions.unknown in one pass — reasoning, cache control, metadata,
  // and service tier all go into the same object for middleware consumption.
  const unknown: Record<string, unknown> = {};

  // Thinking/reasoning — convert to the shared `reasoning` config format so the
  // model middleware (claudeReasoningMiddleware) and provider middleware
  // (bedrockClaudeReasoningMiddleware) handle provider-specific conversion.
  const reasoning = convertThinkingToReasoning(inputs.thinking);
  if (reasoning) {
    unknown["reasoning"] = reasoning.reasoning;
    if (reasoning.reasoning_effort) {
      unknown["reasoning_effort"] = reasoning.reasoning_effort;
    }
  }

  // Per-block cache control is handled in convertToModelMessages.
  // Top-level automatic caching:
  if (inputs.cache_control) {
    Object.assign(unknown, parsePromptCachingOptions(undefined, undefined, inputs.cache_control));
  }

  // Metadata passthrough
  if (inputs.metadata) {
    unknown["metadata"] = inputs.metadata;
  }

  // Service tier
  if (inputs.service_tier) {
    unknown["service_tier"] = inputs.service_tier;
  }

  if (Object.keys(unknown).length > 0) {
    (options.providerOptions as Record<string, unknown>)["unknown"] = unknown;
  }

  // Structured output
  if (inputs.output_config) {
    options.output = convertToOutput(inputs.output_config);
  }

  return options;
}

function convertToOutput(config: MessagesOutputConfig): Output.Output | undefined {
  if (config.type !== "json_schema") return undefined;

  return Output.object({
    name: config.name,
    description: config.description,
    schema: jsonSchema(config.schema),
  });
}

export function convertThinkingToReasoning(thinking?: MessagesThinkingConfig):
  | {
      reasoning: ReasoningConfig;
      reasoning_effort?: ReasoningEffort;
    }
  | undefined {
  if (!thinking) return undefined;

  if (thinking.type === "disabled") {
    return { reasoning: { enabled: false } };
  }

  const summary =
    thinking.display === "summarized" ? "auto" : thinking.display === "omitted" ? "none" : undefined;

  if (thinking.type === "enabled") {
    return {
      reasoning: {
        enabled: true,
        max_tokens: thinking.budget_tokens,
        summary,
      },
      reasoning_effort: "high",
    };
  }

  // adaptive
  return {
    reasoning: {
      enabled: true,
      effort: "medium",
      summary,
    },
    reasoning_effort: "medium",
  };
}

// --- Message Conversion ---

export function convertToModelMessages(
  messages: MessagesMessage[],
  system?: string | Array<{ type: "text"; text: string; cache_control?: CacheControl }>,
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  // System prompt
  if (system) {
    if (typeof system === "string") {
      modelMessages.push({ role: "system", content: system });
    } else {
      const text = system.map((block) => block.text).join("");
      const msg: ModelMessage = { role: "system", content: text };

      // Pass through cache_control from the last system block that has it
      for (let i = system.length - 1; i >= 0; i--) {
        if (system[i]!.cache_control) {
          msg.providerOptions = { unknown: { cache_control: system[i]!.cache_control } };
          break;
        }
      }

      modelMessages.push(msg);
    }
  }

  for (const message of messages) {
    if (message.role === "user") {
      const userMessages = fromUserMessage(message);
      for (let i = 0; i < userMessages.length; i++) {
        modelMessages.push(userMessages[i]!);
      }
    } else if (message.role === "assistant") {
      modelMessages.push(fromAssistantMessage(message));
    }
  }

  return modelMessages;
}

function fromUserMessage(
  message: MessagesMessage & { role: "user" },
): Array<UserModelMessage | ToolModelMessage> {
  const result: Array<UserModelMessage | ToolModelMessage> = [];

  if (typeof message.content === "string") {
    result.push({ role: "user", content: message.content });
    return result;
  }

  const userParts: UserContent = [];
  const toolResultParts: ToolResultPart[] = [];

  for (const block of message.content) {
    if (block.type === "tool_result") {
      toolResultParts.push(fromToolResultBlock(block));
    } else {
      const part = fromUserContentBlock(block);
      if (part) userParts.push(part);
    }
  }

  if (userParts.length > 0) {
    result.push({ role: "user", content: userParts });
  }

  if (toolResultParts.length > 0) {
    result.push({ role: "tool", content: toolResultParts });
  }

  // If only tool results and no user parts, still valid
  if (userParts.length === 0 && toolResultParts.length === 0) {
    result.push({ role: "user", content: "" });
  }

  return result;
}

function fromUserContentBlock(
  block: UserContentBlock,
): TextPart | ImagePart | FilePart | undefined {
  // tool_result blocks are handled separately in fromUserMessage
  // oxlint-disable-next-line switch-exhaustiveness-check
  switch (block.type) {
    case "text": {
      const part: TextPart = { type: "text", text: block.text };
      if (block.cache_control) {
        part.providerOptions = { unknown: { cache_control: block.cache_control } };
      }
      return part;
    }
    case "image": {
      if (block.source.type === "base64") {
        const part: ImagePart = {
          type: "image",
          image: parseBase64(block.source.data),
          mediaType: block.source.media_type,
        };
        if (block.cache_control) {
          part.providerOptions = { unknown: { cache_control: block.cache_control } };
        }
        return part;
      }
      // URL source
      const { image, mediaType } = parseImageInput(block.source.url);
      const part: ImagePart = { type: "image", image, mediaType };
      if (block.cache_control) {
        part.providerOptions = { unknown: { cache_control: block.cache_control } };
      }
      return part;
    }
    case "document": {
      if (block.source.type === "base64") {
        const filePart: FilePart = {
          type: "file",
          data: parseBase64(block.source.data),
          mediaType: block.source.media_type,
        };
        if (block.cache_control) {
          filePart.providerOptions = { unknown: { cache_control: block.cache_control } };
        }
        return filePart;
      }
      if (block.source.type === "url") {
        const filePart: FilePart = {
          type: "file",
          data: new URL(block.source.url),
          mediaType: "application/octet-stream",
        };
        if (block.cache_control) {
          filePart.providerOptions = { unknown: { cache_control: block.cache_control } };
        }
        return filePart;
      }
      // text source
      return { type: "text", text: block.source.text };
    }
    default:
      return undefined;
  }
}

function fromToolResultBlock(block: UserContentBlock & { type: "tool_result" }): ToolResultPart {
  let output: ToolResultPart["output"];

  if (block.content === undefined) {
    output = { type: "text", value: "" };
  } else if (typeof block.content === "string") {
    output = parseJsonOrText(block.content);
  } else {
    const parts: Array<{ type: "text"; text: string } | ImagePart> = [];
    for (const part of block.content) {
      if (part.type === "text") {
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image") {
        if (part.source.type === "base64") {
          parts.push({
            type: "image",
            image: parseBase64(part.source.data),
            mediaType: part.source.media_type,
          });
        } else {
          const { image, mediaType } = parseImageInput(part.source.url);
          parts.push({ type: "image", image, mediaType });
        }
      }
    }
    output = { type: "content", value: parts };
  }

  const result: ToolResultPart = {
    type: "tool-result",
    toolCallId: block.tool_use_id,
    toolName: "",
    output,
  };

  if (block.cache_control) {
    result.providerOptions = { unknown: { cache_control: block.cache_control } };
  }

  return result;
}

function fromAssistantMessage(
  message: MessagesMessage & { role: "assistant" },
): AssistantModelMessage {
  if (typeof message.content === "string") {
    return { role: "assistant", content: message.content };
  }

  const parts: AssistantContent = [];

  for (const block of message.content) {
    switch (block.type) {
      case "text":
        parts.push({ type: "text", text: block.text });
        break;
      case "tool_use":
        parts.push({
          type: "tool-call",
          toolCallId: block.id,
          toolName: block.name,
          input: block.input,
        } satisfies ToolCallPart);
        break;
      case "thinking":
        parts.push({
          type: "reasoning",
          text: block.thinking,
          providerOptions: {
            unknown: { signature: block.signature },
          },
        });
        break;
      case "redacted_thinking":
        parts.push({
          type: "reasoning",
          text: "",
          providerOptions: {
            unknown: { redactedData: block.data },
          },
        });
        break;
    }
  }

  return {
    role: "assistant",
    content: parts.length > 0 ? parts : "",
  };
}

// --- Tool Conversion ---

export function convertToToolSet(tools: MessagesTool[] | undefined): ToolSet | undefined {
  if (!tools || tools.length === 0) return undefined;

  const toolSet: ToolSet = {};
  for (const t of tools) {
    toolSet[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.input_schema),
      strict: t.strict,
    });
  }
  return toolSet;
}

export function convertToToolChoiceOptions(
  toolChoice: MessagesToolChoice | undefined,
): TextCallOptions["toolChoice"] | undefined {
  if (!toolChoice) return undefined;

  switch (toolChoice.type) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    case "none":
      return "none";
    case "tool":
      return { type: "tool", toolName: toolChoice.name };
    default:
      return undefined;
  }
}

// --- Response Flow ---

export function toMessages(
  result: GenerateTextResult<ToolSet, Output.Output>,
  modelId: string,
): Messages {
  const content: MessagesResponseContentBlock[] = [];

  // Thinking blocks
  for (const part of result.content) {
    if (part.type === "reasoning") {
      content.push(toThinkingBlock(part));
    }
  }

  // Text blocks
  for (const part of result.content) {
    if (part.type === "text" && part.text) {
      content.push({ type: "text", text: part.text });
    }
  }

  // Tool use blocks
  const toolCalls = result.toolCalls;
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]!;
    content.push({
      type: "tool_use",
      id: tc.toolCallId,
      name: normalizeToolName(tc.toolName),
      input: stripEmptyKeys(tc.input as Record<string, unknown>) ?? {},
    });
  }

  return {
    id: `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    content,
    model: modelId,
    stop_reason: mapStopReason(result.finishReason),
    stop_sequence: null,
    usage: mapUsage(result.totalUsage),
    service_tier: resolveResponseServiceTier(result.providerMetadata),
  };
}

function toThinkingBlock(reasoning: ReasoningOutput): MessagesResponseContentBlock {
  const { redactedData, signature } = extractReasoningMetadata(reasoning.providerMetadata);

  if (redactedData) {
    return { type: "redacted_thinking", data: redactedData };
  }

  return {
    type: "thinking",
    thinking: reasoning.text,
    signature: signature ?? "",
  };
}

export function mapStopReason(reason: FinishReason): MessagesStopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool-calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content-filter":
      return "end_turn";
    case "error":
    case "other":
      return null;
    default:
      return null;
  }
}

export function mapUsage(usage?: LanguageModelUsage): MessagesUsage {
  const result: MessagesUsage = {
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
  };

  if (usage?.inputTokenDetails?.cacheWriteTokens !== undefined) {
    result.cache_creation_input_tokens = usage.inputTokenDetails.cacheWriteTokens;
  }

  if (usage?.inputTokenDetails?.cacheReadTokens !== undefined) {
    result.cache_read_input_tokens = usage.inputTokenDetails.cacheReadTokens;
  }

  return result;
}

// --- Streaming ---

export function toMessagesStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  modelId: string,
): MessagesStream {
  return result.fullStream.pipeThrough(new MessagesTransformStream(modelId));
}

export class MessagesTransformStream extends TransformStream<
  TextStreamPart<ToolSet>,
  MessagesStreamEvent
> {
  constructor(modelId: string) {
    let blockIndex = 0;
    let currentToolCallId: string | undefined;

    super({
      start(controller) {
        const emptyMessage: Messages = {
          id: `msg_${crypto.randomUUID()}`,
          type: "message",
          role: "assistant",
          content: [],
          model: modelId,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        };

        controller.enqueue({
          event: "message_start",
          data: { type: "message_start", message: emptyMessage },
        });
      },

      transform(part, controller) {
        // Not all TextStreamPart types are relevant for Messages SSE format
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "reasoning-start": {
            controller.enqueue({
              event: "content_block_start",
              data: {
                type: "content_block_start",
                index: blockIndex,
                content_block: { type: "thinking", thinking: "" },
              },
            });
            break;
          }

          case "reasoning-delta": {
            controller.enqueue({
              event: "content_block_delta",
              data: {
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "thinking_delta", thinking: part.text },
              },
            });
            break;
          }

          case "reasoning-end": {
            // Emit signature delta if available from provider metadata
            const { signature } = extractReasoningMetadata(part.providerMetadata);
            if (signature) {
              controller.enqueue({
                event: "content_block_delta",
                data: {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: { type: "signature_delta", signature },
                },
              });
            }

            controller.enqueue({
              event: "content_block_stop",
              data: { type: "content_block_stop", index: blockIndex },
            });
            blockIndex++;
            break;
          }

          case "text-start": {
            controller.enqueue({
              event: "content_block_start",
              data: {
                type: "content_block_start",
                index: blockIndex,
                content_block: { type: "text", text: "" },
              },
            });
            break;
          }

          case "text-delta": {
            controller.enqueue({
              event: "content_block_delta",
              data: {
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "text_delta", text: part.text },
              },
            });
            break;
          }

          case "text-end": {
            controller.enqueue({
              event: "content_block_stop",
              data: { type: "content_block_stop", index: blockIndex },
            });
            blockIndex++;
            break;
          }

          case "tool-input-start": {
            currentToolCallId = part.id;

            controller.enqueue({
              event: "content_block_start",
              data: {
                type: "content_block_start",
                index: blockIndex,
                content_block: {
                  type: "tool_use",
                  id: part.id,
                  name: normalizeToolName(part.toolName),
                  input: {} as Record<string, never>,
                },
              },
            });
            break;
          }

          case "tool-input-delta": {
            controller.enqueue({
              event: "content_block_delta",
              data: {
                type: "content_block_delta",
                index: blockIndex,
                delta: { type: "input_json_delta", partial_json: part.delta },
              },
            });
            break;
          }

          case "tool-call": {
            // If we had streaming tool input, close the block
            if (currentToolCallId === part.toolCallId) {
              controller.enqueue({
                event: "content_block_stop",
                data: { type: "content_block_stop", index: blockIndex },
              });
              blockIndex++;
              currentToolCallId = undefined;
            } else {
              // Non-streaming tool call: emit start + stop
              controller.enqueue({
                event: "content_block_start",
                data: {
                  type: "content_block_start",
                  index: blockIndex,
                  content_block: {
                    type: "tool_use",
                    id: part.toolCallId,
                    name: normalizeToolName(part.toolName),
                    input: {} as Record<string, never>,
                  },
                },
              });
              const inputStr =
                typeof part.input === "string"
                  ? part.input
                  : JSON.stringify(stripEmptyKeys(part.input as Record<string, unknown>));
              if (inputStr) {
                controller.enqueue({
                  event: "content_block_delta",
                  data: {
                    type: "content_block_delta",
                    index: blockIndex,
                    delta: { type: "input_json_delta", partial_json: inputStr },
                  },
                });
              }
              controller.enqueue({
                event: "content_block_stop",
                data: { type: "content_block_stop", index: blockIndex },
              });
              blockIndex++;
            }
            break;
          }

          case "finish-step": {
            // No-op for messages; metadata is not surfaced in Anthropic stream format
            break;
          }

          case "finish": {
            const stopReason = mapStopReason(part.finishReason);
            const totalOutputTokens = part.totalUsage?.outputTokens ?? 0;
            const totalInputTokens = part.totalUsage?.inputTokens ?? 0;

            controller.enqueue({
              event: "message_delta",
              data: {
                type: "message_delta",
                delta: { stop_reason: stopReason, stop_sequence: null },
                usage: { output_tokens: totalOutputTokens, input_tokens: totalInputTokens },
              },
            });

            controller.enqueue({
              event: "message_stop",
              data: { type: "message_stop" },
            });
            break;
          }

          case "error": {
            const message =
              part.error instanceof Error ? part.error.message : String(part.error);
            controller.enqueue({
              event: "error",
              data: {
                type: "error",
                error: { type: "api_error", message },
              },
            });
            break;
          }

          default:
            break;
        }
      },
    });
  }
}
