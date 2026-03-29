import type { SharedV3ProviderOptions, SharedV3ProviderMetadata } from "@ai-sdk/provider";
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
  ImagePart,
  FilePart,
} from "ai";

import { Output, jsonSchema, stepCountIs, tool, type JSONValue } from "ai";
import { v7 as uuidv7 } from "uuid";

import type {
  ResponsesInputItem,
  ResponsesMessageItem,
  ResponsesInputText,
  ResponsesInputContent,
  ResponsesFunctionCall,
  ResponsesFunctionCallOutput,
  ResponsesReasoningItem,
  ResponsesOutputText,
  ResponsesOutputMessage,
  ResponsesOutputItem,
  ResponsesInputs,
  Responses,
  ResponsesUsage,
  ResponsesStatus,
  ResponsesStream,
  ResponsesStreamEvent,
  ResponsesToolChoice,
  ResponsesTool,
  ResponsesTextConfig,
  ResponsesSummaryText,
} from "./schema";

import type { SseErrorFrame } from "../../utils/stream";

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
  parseUrl,
  extractReasoningMetadata,
  type TextCallOptions,
  type ToolChoiceOptions,
} from "../shared/converters";

// --- Request Flow ---

export function convertToTextCallOptions(params: ResponsesInputs): TextCallOptions {
  const {
    input,
    instructions,
    tools,
    tool_choice,
    text,
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
    max_output_tokens,
    max_tool_calls,
    reasoning_effort,
    reasoning,
    prompt_cache_key,
    parallel_tool_calls,
    extra_body,
    cache_control,
    ...rest
  } = params;

  Object.assign(rest, parseReasoningOptions(reasoning_effort, reasoning));
  Object.assign(rest, parsePromptCachingOptions(prompt_cache_key, undefined, cache_control));

  if (parallel_tool_calls !== undefined) {
    Object.assign(rest, { parallel_tool_calls });
  }

  if (extra_body) {
    for (const v of Object.values(extra_body)) {
      Object.assign(rest, v);
    }
  }

  const { toolChoice: tc, activeTools } = convertToToolChoiceOptions(tool_choice);

  return {
    messages: convertToModelMessages(input, instructions),
    tools: convertToToolSet(tools),
    toolChoice: tc,
    activeTools,
    output: convertToOutput(text),
    temperature,
    maxOutputTokens: max_output_tokens,
    stopWhen: max_tool_calls === undefined ? undefined : stepCountIs(max_tool_calls),
    frequencyPenalty: frequency_penalty,
    presencePenalty: presence_penalty,
    topP: top_p,
    providerOptions: {
      unknown: rest,
    },
  };
}

function convertToOutput(text: ResponsesTextConfig | undefined) {
  if (!text?.format || text.format.type === "text") {
    return;
  }

  const { name, description, schema } = text.format;
  return Output.object({
    name,
    description,
    schema: jsonSchema(schema),
  });
}

export function convertToModelMessages(
  input: string | ResponsesInputItem[],
  instructions?: string,
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  if (instructions) {
    modelMessages.push({
      role: "system",
      content: instructions,
    });
  }

  if (typeof input === "string") {
    modelMessages.push({
      role: "user",
      content: input,
    });
    return modelMessages;
  }

  const toolOutputByCallId = indexToolOutputs(input);

  for (const item of input) {
    if (item.type === "function_call_output") continue;

    if (item.type === "message") {
      modelMessages.push(fromMessageItem(item));
      continue;
    }

    if (item.type === "function_call") {
      modelMessages.push(fromFunctionCallItem(item));
      const toolResult = fromFunctionCallOutputItem(item, toolOutputByCallId);
      if (toolResult) modelMessages.push(toolResult);
      continue;
    }

    if (item.type === "reasoning") {
      modelMessages.push(fromReasoningItem(item));
      continue;
    }
  }

  return modelMessages;
}

function fromReasoningItem(item: ResponsesReasoningItem): AssistantModelMessage {
  const parts: AssistantContent = [];

  if (!item.summary || item.summary.length === 0) {
    return { role: "assistant", content: parts };
  }

  let providerOptions: SharedV3ProviderOptions | undefined;
  if (item.extra_content || item.encrypted_content) {
    providerOptions = (item.extra_content as SharedV3ProviderOptions) ?? { unknown: {} };
    if (item.encrypted_content) {
      ((providerOptions ??= { unknown: {} })["unknown"] ??= {})["redactedData"] =
        item.encrypted_content;
    }
  }

  for (const s of item.summary) {
    parts.push({
      type: "reasoning",
      text: s.text,
      providerOptions,
    });
  }

  return { role: "assistant", content: parts };
}
function indexToolOutputs(items: ResponsesInputItem[]) {
  const map = new Map<string, ResponsesFunctionCallOutput>();
  for (const item of items) {
    if (item.type === "function_call_output") {
      map.set(item.call_id, item);
    }
  }
  return map;
}

function fromMessageItem(item: ResponsesMessageItem): ModelMessage {
  switch (item.role) {
    case "system":
    case "developer": {
      const out: ModelMessage = {
        role: "system",
        content:
          typeof item.content === "string"
            ? item.content
            : item.content
                // FUTURE: Support multimodal content in system messages (currently limited to
                // text by AI SDK)
                .filter((p): p is ResponsesInputText => p.type === "input_text")
                .map((p) => p.text)
                .join(""),
      };

      if (item.extra_content) {
        out.providerOptions = item.extra_content as SharedV3ProviderOptions;
      }

      if (item.cache_control) {
        ((out.providerOptions ??= { unknown: {} })["unknown"] ??= {})["cache_control"] =
          item.cache_control as JSONValue;
      }
      return out;
    }
    case "user":
      return fromUserMessageItem(item);
    case "assistant":
      return fromAssistantMessageItem(item);
  }
}

function fromUserMessageItem(item: ResponsesMessageItem & { role: "user" }): UserModelMessage {
  const out: UserModelMessage = {
    role: "user",
    content: fromInputContent(item.content),
  };

  if (item.extra_content) {
    out.providerOptions = item.extra_content as SharedV3ProviderOptions;
  }

  if (item.cache_control) {
    ((out.providerOptions ??= { unknown: {} })["unknown"] ??= {})["cache_control"] =
      item.cache_control as JSONValue;
  }

  return out;
}

function fromImageInput(url: string): ImagePart | FilePart {
  const { image, mediaType } = parseImageInput(url);
  return {
    type: "image",
    image,
    mediaType,
  };
}

function fromFileInput(data: string, filename?: string): FilePart {
  return {
    type: "file",
    data: parseBase64(data),
    filename,
    mediaType: "application/octet-stream",
  };
}

/**
 * Converts input content (string or multimodal parts) into UserContent for messages.
 * Uses unified ImagePart/FilePart schemas for the array case.
 */
function fromInputContent(content: string | ResponsesInputContent[]): UserContent {
  if (typeof content === "string") {
    return content;
  }

  const result: UserContent = [];
  for (const part of content) {
    switch (part.type) {
      case "input_text":
        result.push({ type: "text", text: part.text });
        break;
      case "input_image": {
        if (part.image_url !== undefined) {
          result.push(fromImageInput(part.image_url));
        } else if (part.file_id !== undefined) {
          // Note: passing file_id as image data is provider-dependent.
          // AI SDK's ImagePart.image expects Uint8Array | URL | string (base64 or URL).
          result.push({ type: "image", image: part.file_id });
        }
        break;
      }
      case "input_file": {
        if (part.file_data !== undefined) {
          result.push(fromFileInput(part.file_data, part.filename));
        } else if (part.file_url !== undefined) {
          result.push({
            type: "file",
            data: parseUrl(part.file_url),
            filename: part.filename,
            mediaType: "application/octet-stream",
          });
        } else if (part.file_id !== undefined) {
          result.push({
            type: "file",
            data: part.file_id,
            filename: part.filename,
            mediaType: "application/octet-stream",
          });
        }
        break;
      }
      case "input_audio": {
        const out: FilePart = {
          type: "file",
          data: parseBase64(part.input_audio.data),
          mediaType: `audio/${part.input_audio.format}`,
        };
        if (part.cache_control) {
          out.providerOptions = {
            unknown: { cache_control: part.cache_control },
          };
        }
        result.push(out);
        break;
      }
    }
  }
  return result;
}

function fromAssistantMessageItem(
  item: ResponsesMessageItem & { role: "assistant" },
): AssistantModelMessage {
  let content: string | AssistantContent;
  if (typeof item.content === "string") {
    content = item.content;
  } else {
    const parts: AssistantContent = [];
    for (const part of item.content) {
      if (part.type === "output_text") {
        parts.push({ type: "text", text: part.text });
      }
    }
    content = parts.length > 0 ? parts : "";
  }

  const out: AssistantModelMessage = { role: "assistant", content };

  if (item.extra_content) {
    out.providerOptions = item.extra_content as SharedV3ProviderOptions;
  }

  if (item.cache_control) {
    ((out.providerOptions ??= { unknown: {} })["unknown"] ??= {})["cache_control"] =
      item.cache_control as JSONValue;
  }

  return out;
}

function fromFunctionCallItem(item: ResponsesFunctionCall): AssistantModelMessage {
  const toolCall: ToolCallPart = {
    type: "tool-call",
    toolCallId: item.call_id,
    toolName: item.name,
    input: parseJsonOrText(item.arguments).value,
  };

  if (item.extra_content) {
    toolCall.providerOptions = item.extra_content as SharedV3ProviderOptions;
  }

  if (item.cache_control) {
    ((toolCall.providerOptions ??= { unknown: {} })["unknown"] ??= {})["cache_control"] =
      item.cache_control as JSONValue;
  }

  return { role: "assistant", content: [toolCall] };
}

/**
 * Converts a tool result (string or multimodal parts) into the schema required by ToolResultPart.
 */
function fromToolOutput(output: string | ResponsesInputContent[]): ToolResultPart["output"] {
  if (typeof output === "string") {
    return parseJsonOrText(output);
  }

  const value: any[] = [];
  for (const part of output) {
    if (part.type === "input_text") {
      value.push({ type: "text", text: part.text });
      continue;
    }

    if (part.type === "input_image") {
      if (part.image_url !== undefined) {
        const { image, mediaType } = parseImageInput(part.image_url);
        if (image instanceof URL) {
          value.push({ type: "image-url", url: image.toString() });
        } else {
          value.push({
            type: "image-data",
            data: image,
            mediaType: mediaType!,
          });
        }
      } else if (part.file_id !== undefined) {
        value.push({ type: "image-file-id", fileId: part.file_id });
      }
      continue;
    }

    if (part.type === "input_file") {
      if (part.file_data !== undefined) {
        value.push({
          type: "file-data",
          data: part.file_data,
          mediaType: "application/octet-stream",
          filename: part.filename,
        });
      } else if (part.file_url !== undefined) {
        value.push({ type: "file-url", url: part.file_url });
      } else if (part.file_id !== undefined) {
        value.push({ type: "file-id", fileId: part.file_id });
      }
      continue;
    }

    if (part.type === "input_audio") {
      value.push({
        type: "file-data",
        data: part.input_audio.data,
        mediaType: `audio/${part.input_audio.format}`,
      });
      continue;
    }
  }

  return {
    type: "content",
    value: value as (ToolResultPart["output"] & { type: "content" })["value"],
  };
}

function fromFunctionCallOutputItem(
  item: ResponsesFunctionCall,
  toolOutputByCallId: Map<string, ResponsesFunctionCallOutput>,
): ToolModelMessage | undefined {
  const output = toolOutputByCallId.get(item.call_id);
  if (!output) return undefined;

  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: item.call_id,
        toolName: item.name,
        output: fromToolOutput(output.output),
      } satisfies ToolResultPart,
    ],
  };
}

export const convertToToolSet = (tools: ResponsesTool[] | undefined): ToolSet | undefined => {
  if (!tools) {
    return;
  }

  const toolSet: ToolSet = {};
  for (const t of tools) {
    toolSet[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.parameters),
      strict: t.strict,
    });
  }
  return toolSet;
};

export const convertToToolChoiceOptions = (
  toolChoice: ResponsesToolChoice | undefined,
): ToolChoiceOptions => {
  if (!toolChoice) return {};

  if (
    toolChoice === "none" ||
    toolChoice === "auto" ||
    toolChoice === "required" ||
    toolChoice === "validated"
  ) {
    // FUTURE: this is right now google specific, which is not supported by AI SDK, until then,
    // we temporarily map it to auto for now
    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview
    return { toolChoice: toolChoice === "validated" ? "auto" : toolChoice };
  }

  if ("type" in toolChoice && toolChoice.type === "allowed_tools") {
    return {
      toolChoice: toolChoice.allowed_tools.mode,
      activeTools: toolChoice.allowed_tools.tools.map((toolRef) => toolRef.name),
    };
  }

  return {
    toolChoice: {
      type: "tool",
      toolName: toolChoice.name,
    },
  };
};

// --- Response Flow ---

export function toResponses(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  metadata?: Record<string, string> | null,
): Responses {
  const now = Math.floor(Date.now() / 1000);
  const output = toOutputItems(result);
  const status = toResponsesStatus(result.finishReason);

  return {
    id: uuidv7(),
    object: "response",
    status,
    model,
    output,
    usage: result.totalUsage ? toResponsesUsage(result.totalUsage) : null,
    incomplete_details:
      status === "incomplete" ? { reason: toIncompleteReason(result.finishReason) } : null,
    created_at: now,
    completed_at: status === "completed" ? now : null,
    service_tier: resolveResponseServiceTier(result.providerMetadata),
    metadata,
    provider_metadata: result.providerMetadata,
  };
}

export function toResponsesResponse(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  metadata?: Record<string, string> | null,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toResponses(result, model, metadata), responseInit);
}

export function toResponsesStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  metadata?: Record<string, string> | null,
): ResponsesStream {
  return result.fullStream.pipeThrough(new ResponsesTransformStream(model, metadata));
}

export function toResponsesStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  metadata?: Record<string, string> | null,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toResponsesStream(result, model, metadata), responseInit);
}

function toOutputItems(result: GenerateTextResult<ToolSet, Output.Output>): ResponsesOutputItem[] {
  const output: ResponsesOutputItem[] = [];

  // Add reasoning items
  for (const part of result.content) {
    if (part.type === "reasoning") {
      output.push(toReasoningOutputItem(part));
    }
  }

  // Add function call items
  if (result.toolCalls && result.toolCalls.length > 0) {
    for (const tc of result.toolCalls) {
      output.push(toFunctionCallItem(tc.toolCallId, tc.toolName, tc.input, tc.providerMetadata));
    }
  }

  // Add message output item
  const textParts: ResponsesOutputText[] = [];
  for (const part of result.content) {
    if (part.type === "text") {
      textParts.push({
        type: "output_text",
        text: part.text,
        annotations: [],
      });
    }
  }

  if (textParts.length > 0 || result.toolCalls.length === 0) {
    const msgItem: ResponsesOutputMessage = {
      type: "message",
      id: uuidv7(),
      role: "assistant",
      status: "completed",
      content:
        textParts.length > 0 ? textParts : [{ type: "output_text", text: "", annotations: [] }],
    };
    if (result.providerMetadata) {
      msgItem.extra_content = result.providerMetadata;
    }
    output.push(msgItem);
  }

  return output;
}

function toReasoningOutputItem(reasoning: ReasoningOutput): ResponsesReasoningItem {
  const item: ResponsesReasoningItem = {
    type: "reasoning",
    id: uuidv7(),
    summary: [],
    status: "completed",
  };

  if (reasoning.text) {
    item.summary = [{ type: "summary_text", text: reasoning.text }];
  }

  const providerMetadata = reasoning.providerMetadata ?? {};
  item.extra_content = providerMetadata;

  const { redactedData } = extractReasoningMetadata(providerMetadata);
  if (redactedData) {
    item.encrypted_content = redactedData;
  }

  return item;
}

function toFunctionCallItem(
  toolCallId: string,
  toolName: string,
  input: unknown,
  providerMetadata?: SharedV3ProviderMetadata,
): ResponsesFunctionCall {
  const item: ResponsesFunctionCall = {
    type: "function_call",
    id: uuidv7(),
    call_id: toolCallId,
    name: normalizeToolName(toolName),
    arguments:
      typeof input === "string"
        ? input
        : JSON.stringify(stripEmptyKeys(input as Record<string, unknown>)),
    status: "completed",
  };

  if (providerMetadata) {
    item.extra_content = providerMetadata;
  }

  return item;
}

export function toResponsesUsage(usage: LanguageModelUsage): ResponsesUsage {
  const result: ResponsesUsage = {
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
  };

  if (usage.inputTokenDetails?.cacheReadTokens !== undefined) {
    result.input_tokens_details = {
      cached_tokens: usage.inputTokenDetails.cacheReadTokens,
    };
  }

  if (usage.outputTokenDetails?.reasoningTokens !== undefined) {
    result.output_tokens_details = {
      reasoning_tokens: usage.outputTokenDetails.reasoningTokens,
    };
  }

  return result;
}

function toResponsesStatus(finishReason: FinishReason): ResponsesStatus {
  switch (finishReason) {
    case "stop":
    case "tool-calls":
      return "completed";
    case "length":
    case "content-filter":
      return "incomplete";
    case "error":
    case "other":
      return "failed";
    default:
      return "completed";
  }
}

function toIncompleteReason(finishReason: FinishReason): string {
  // This switch only handles reasons that result in an "incomplete" status
  // ('stop', 'tool-calls', 'error', 'other' are handled by their respective statuses).
  // oxlint-disable-next-line switch-exhaustiveness-check
  switch (finishReason) {
    case "length":
      return "max_output_tokens";
    case "content-filter":
      return "content_filter";
    default:
      return "unknown";
  }
}

// --- Streaming ---

export class ResponsesTransformStream extends TransformStream<
  TextStreamPart<ToolSet>,
  ResponsesStreamEvent | SseErrorFrame
> {
  constructor(model: string, metadata?: Record<string, string> | null) {
    const responseId = uuidv7();
    const creationTime = Math.floor(Date.now() / 1000);
    let outputIndex = 0;
    let messageItem: ResponsesOutputMessage | undefined;
    let messageOutputIndex = -1;
    let contentIndex = 0;

    let reasoningItem: ResponsesReasoningItem | undefined;
    let reasoningOutputIndex = -1;
    let summaryIndex = 0;
    let finishProviderMetadata: SharedV3ProviderMetadata | undefined;
    const outputItems: ResponsesOutputItem[] = [];

    const createResponse = (
      status: ResponsesStatus,
      usage: ResponsesUsage | null,
      completedAt: number | null,
      incompleteDetails?: Responses["incomplete_details"],
      serviceTier?: Responses["service_tier"],
      providerMetadata?: SharedV3ProviderMetadata,
    ): Responses => ({
      id: responseId,
      object: "response",
      status,
      model,
      output: outputItems.slice(),
      usage,
      created_at: creationTime,
      completed_at: completedAt,
      incomplete_details: incompleteDetails,
      service_tier: serviceTier,
      metadata,
      provider_metadata: providerMetadata,
    });

    const initMessageItem = (
      controller: TransformStreamDefaultController<ResponsesStreamEvent | SseErrorFrame>,
      providerMetadata?: SharedV3ProviderMetadata,
    ) => {
      if (messageItem) return;

      messageItem = {
        type: "message",
        id: uuidv7(),
        role: "assistant",
        status: "in_progress",
        content: [],
      };

      if (providerMetadata) {
        messageItem.extra_content = providerMetadata;
      }

      messageOutputIndex = outputIndex++;
      outputItems.push(messageItem);

      controller.enqueue({
        event: "response.output_item.added",
        data: {
          type: "response.output_item.added",
          output_index: messageOutputIndex,
          item: messageItem,
        },
      });
    };

    const closeReasoningItem = (
      controller: TransformStreamDefaultController<ResponsesStreamEvent | SseErrorFrame>,
    ) => {
      if (reasoningItem && reasoningItem.summary.length > 0) {
        const lastSummaryPart = reasoningItem.summary[summaryIndex];
        if (lastSummaryPart) {
          controller.enqueue({
            event: "response.reasoning_summary_part.done",
            data: {
              type: "response.reasoning_summary_part.done",
              item_id: reasoningItem.id!,
              output_index: reasoningOutputIndex,
              summary_index: summaryIndex,
              part: lastSummaryPart,
            },
          });
        }
      }

      if (reasoningItem) {
        reasoningItem.status = "completed";
        controller.enqueue({
          event: "response.output_item.done",
          data: {
            type: "response.output_item.done",
            output_index: reasoningOutputIndex,
            item: reasoningItem,
          },
        });
        reasoningItem = undefined;
      }
    };

    const closeMessageItem = (
      controller: TransformStreamDefaultController<ResponsesStreamEvent | SseErrorFrame>,
    ) => {
      if (messageItem && messageItem.content.length > 0) {
        const lastPart = messageItem.content[contentIndex];
        if (lastPart) {
          controller.enqueue({
            event: "response.content_part.done",
            data: {
              type: "response.content_part.done",
              item_id: messageItem.id,
              output_index: messageOutputIndex,
              content_index: contentIndex,
              part: lastPart,
            },
          });
        }
      }

      if (messageItem) {
        messageItem.status = "completed";
        controller.enqueue({
          event: "response.output_item.done",
          data: {
            type: "response.output_item.done",
            output_index: messageOutputIndex,
            item: messageItem,
          },
        });
        messageItem = undefined;
      }
    };

    super({
      start(controller) {
        controller.enqueue({
          event: "response.created",
          data: {
            type: "response.created",
            response: createResponse("in_progress", null, null),
          },
        });

        controller.enqueue({
          event: "response.in_progress",
          data: {
            type: "response.in_progress",
            response: createResponse("in_progress", null, null),
          },
        });
      },

      transform(part, controller) {
        // We explicitly omit several stream part types from the AI SDK:
        // - 'text-end': Item closure is handled generically on 'finish' / 'finish-step'
        // - 'tool-input-*' ('start', 'delta', 'end'): The AI SDK streams tool arguments
        //   chunk-by-chunk, but our API schema requires sending the fully-formed tool call at once.
        //   We ignore the chunks and wait for the final 'tool-call' event.
        // - 'tool-result', 'tool-error', 'tool-output-denied': These only occur if the server
        //   executes the tools on behalf of the user. Our gateway only relays the model's
        //   request to call a tool back to the client.
        // - 'start', 'start-step': Metadata events that do not map to our output items.
        // - 'abort': Stream cancellation is handled at the network/abort-controller level.
        // - 'source', 'file': No current schema support in the Responses format.
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "reasoning-start": {
            if (reasoningItem) break;

            reasoningItem = {
              type: "reasoning",
              id: uuidv7(),
              status: "in_progress",
              summary: [],
            };

            const providerMetadata = part.providerMetadata;
            if (providerMetadata) {
              reasoningItem.extra_content = providerMetadata;
              const { redactedData } = extractReasoningMetadata(providerMetadata);
              if (redactedData) {
                reasoningItem.encrypted_content = redactedData;
              }
            }

            reasoningOutputIndex = outputIndex++;
            outputItems.push(reasoningItem);

            controller.enqueue({
              event: "response.output_item.added",
              data: {
                type: "response.output_item.added",
                output_index: reasoningOutputIndex,
                item: reasoningItem,
              },
            });
            break;
          }

          case "reasoning-delta": {
            if (summaryIndex === reasoningItem!.summary.length) {
              const summaryPart: ResponsesSummaryText = {
                type: "summary_text",
                text: "",
              };
              reasoningItem!.summary.push(summaryPart);

              controller.enqueue({
                event: "response.reasoning_summary_part.added",
                data: {
                  type: "response.reasoning_summary_part.added",
                  item_id: reasoningItem!.id!,
                  output_index: reasoningOutputIndex,
                  summary_index: summaryIndex,
                  part: summaryPart,
                },
              });
            }

            reasoningItem!.summary[summaryIndex]!.text += part.text;

            controller.enqueue({
              event: "response.reasoning_summary_text.delta",
              data: {
                type: "response.reasoning_summary_text.delta",
                item_id: reasoningItem!.id!,
                output_index: reasoningOutputIndex,
                summary_index: summaryIndex,
                delta: part.text,
              },
            });
            break;
          }

          case "reasoning-end": {
            closeReasoningItem(controller);
            break;
          }

          case "text-start": {
            initMessageItem(controller, part.providerMetadata);
            break;
          }

          case "text-delta": {
            if (contentIndex === messageItem!.content.length) {
              const textPart: ResponsesOutputText = {
                type: "output_text",
                text: "",
                annotations: [],
              };
              messageItem!.content.push(textPart);

              controller.enqueue({
                event: "response.content_part.added",
                data: {
                  type: "response.content_part.added",
                  item_id: messageItem!.id,
                  output_index: messageOutputIndex,
                  content_index: contentIndex,
                  part: textPart,
                },
              });
            }

            messageItem!.content[contentIndex]!.text += part.text;

            controller.enqueue({
              event: "response.output_text.delta",
              data: {
                type: "response.output_text.delta",
                item_id: messageItem!.id,
                output_index: messageOutputIndex,
                content_index: contentIndex,
                delta: part.text,
              },
            });
            break;
          }

          case "tool-call": {
            const fnItem = toFunctionCallItem(
              part.toolCallId,
              part.toolName,
              part.input,
              part.providerMetadata,
            );
            const fnOutputIndex = outputIndex++;
            outputItems.push(fnItem);

            controller.enqueue({
              event: "response.output_item.added",
              data: {
                type: "response.output_item.added",
                output_index: fnOutputIndex,
                item: fnItem,
              },
            });

            controller.enqueue({
              event: "response.output_item.done",
              data: {
                type: "response.output_item.done",
                output_index: fnOutputIndex,
                item: fnItem,
              },
            });
            break;
          }

          case "finish-step": {
            finishProviderMetadata = part.providerMetadata;
            break;
          }

          case "finish": {
            // Ensure empty message item is emitted if no tool calls and no text
            if (!messageItem && !outputItems.some((i) => i.type === "function_call")) {
              initMessageItem(controller);
              const textPart: ResponsesOutputText = {
                type: "output_text",
                text: "",
                annotations: [],
              };
              messageItem!.content.push(textPart);
              controller.enqueue({
                event: "response.content_part.added",
                data: {
                  type: "response.content_part.added",
                  item_id: messageItem!.id,
                  output_index: messageOutputIndex,
                  content_index: contentIndex,
                  part: textPart,
                },
              });
            }

            closeReasoningItem(controller);
            closeMessageItem(controller);

            const status = toResponsesStatus(part.finishReason);
            const usage = part.totalUsage ? toResponsesUsage(part.totalUsage) : null;
            const now = Math.floor(Date.now() / 1000);
            const incompleteDetails =
              status === "incomplete" ? { reason: toIncompleteReason(part.finishReason) } : null;

            const finalResponse: Responses = createResponse(
              status,
              usage,
              status === "completed" ? now : null,
              incompleteDetails,
              resolveResponseServiceTier(finishProviderMetadata),
              finishProviderMetadata,
            );

            if (status === "failed") {
              controller.enqueue({
                event: "response.failed",
                data: {
                  type: "response.failed",
                  response: finalResponse,
                },
              });
            } else {
              controller.enqueue({
                event: "response.completed",
                data: {
                  type: "response.completed",
                  response: finalResponse,
                },
              });
            }
            break;
          }

          case "error": {
            controller.enqueue({
              data: part.error instanceof Error ? part.error : new Error(String(part.error)),
            });
            break;
          }
        }
      },
    });
  }
}
