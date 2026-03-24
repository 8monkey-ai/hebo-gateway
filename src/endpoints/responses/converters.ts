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
  TextStreamPart,
  ReasoningOutput,
  AssistantModelMessage,
  ToolModelMessage,
  UserModelMessage,
  ImagePart,
  FilePart,
  StopCondition,
} from "ai";

import { Output, jsonSchema, tool, stepCountIs, type JSONValue } from "ai";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import type {
  ResponsesInputItem,
  ResponsesMessageItem,
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

import { GatewayError } from "../../errors/gateway";
import { toResponse } from "../../utils/response";
import { parseDataUrl } from "../../utils/url";
import {
  parseJsonOrText,
  parseReasoningOptions,
  parsePromptCachingOptions,
  resolveResponseServiceTier,
  normalizeToolName,
  stripEmptyKeys,
  parseBase64,
  parseImageInput,
  mapLanguageModelUsage,
  toToolSet,
  extractReasoningMetadata,
  type TextCallOptions,
} from "../shared/converters";

// --- Request Flow ---

export function convertToResponsesTextCallOptions(params: ResponsesInputs): TextCallOptions {

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

  const { toolChoice: tc, activeTools } = convertToResponsesToolChoiceOptions(tool_choice);

  return {
    messages: convertToResponsesModelMessages(input, instructions),
    tools: convertToResponsesToolSet(tools),
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

export function convertToResponsesModelMessages(
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

  const extra = (item as Record<string, unknown>)["extra_content"] as
    | Record<string, unknown>
    | undefined;

  for (const s of item.summary) {
    if (extra || item.encrypted_content) {
      const unknownOpts: Record<string, unknown> = extra ? { ...extra } : {};
      if (item.encrypted_content) {
        unknownOpts["redactedData"] = item.encrypted_content;
      }
      parts.push({
        type: "reasoning",
        text: s.text,
        providerOptions: { unknown: unknownOpts as Record<string, JSONValue> },
      });
    } else {
      parts.push({
        type: "reasoning",
        text: s.text,
      });
    }
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
            : item.content.map(fromInputContentPart).join(""),
      };
      if ("cache_control" in item && item["cache_control"]) {
        out.providerOptions = { unknown: { cache_control: item["cache_control"] as JSONValue } };
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
  const out: UserModelMessage = { role: "user", content: "" };

  if (typeof item.content === "string") {
    out.content = item.content;
  } else {
    const content: UserContent = [];
    for (const part of item.content) {
      switch (part.type) {
        case "input_text":
          content.push({ type: "text", text: part.text });
          break;
        case "input_image": {
          if (part.image_url !== undefined) {
            content.push(fromImageInput(part.image_url));
          } else if (part.file_id !== undefined) {
            // Note: passing file_id as image data is provider-dependent.
            // AI SDK's ImagePart.image expects Uint8Array | URL | string (base64 or URL).
            content.push({ type: "image", image: part.file_id });
          }
          break;
        }
        case "input_file": {
          if (part.file_data !== undefined) {
            content.push(fromFileInput(part.file_data, part.filename));
          } else if (part.file_url !== undefined) {
            content.push({
              type: "file",
              data: parseUrl(part.file_url, "Invalid file URL"),
              filename: part.filename,
              mediaType: "application/octet-stream",
            });
          } else if (part.file_id !== undefined) {
            content.push({
              type: "file",
              data: part.file_id,
              filename: part.filename,
              mediaType: "application/octet-stream",
            });
          }
          break;
        }
      }
    }
    out.content = content;
  }

  if ("cache_control" in item && item["cache_control"]) {
    out.providerOptions = { unknown: { cache_control: item["cache_control"] as JSONValue } };
  }

  return out;
}

function parseUrl(url: string, errorPrefix = "Invalid URL"): URL {
  try {
    return new URL(url);
  } catch {
    throw new GatewayError(`${errorPrefix}: ${url}`, 400);
  }
}

function fromImageInput(url: string): ImagePart | FilePart {
  const { image, mediaType } = parseImageInput(url, "Invalid image URL");
  return {
    type: "image",
    image,
    mediaType,
  };
}

function fromFileInput(data: string, filename?: string): FilePart {
  return {
    type: "file",
    data: parseBase64(data, "Invalid base64 data in file input"),
    filename,
    mediaType: "application/octet-stream",
  };
}

function fromInputContentPart(part: { type: string; text?: string }): string {
  if ("text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

function fromAssistantMessageItem(
  item: ResponsesMessageItem & { role: "assistant" },
): AssistantModelMessage {
  if (typeof item.content === "string") {
    const out: AssistantModelMessage = { role: "assistant", content: item.content };
    if ("extra_content" in item && item["extra_content"]) {
      out.providerOptions = item["extra_content"] as SharedV3ProviderOptions;
    }
    return out;
  }

  const parts: AssistantContent = [];
  for (const part of item.content) {
    if (part.type === "output_text") {
      parts.push({ type: "text", text: part.text });
    }
  }

  const out: AssistantModelMessage = { role: "assistant", content: parts.length > 0 ? parts : "" };
  if ("extra_content" in item && item["extra_content"]) {
    out.providerOptions = item["extra_content"] as SharedV3ProviderOptions;
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

  if ("extra_content" in item && item["extra_content"]) {
    toolCall.providerOptions = item["extra_content"] as SharedV3ProviderOptions;
  }

  return { role: "assistant", content: [toolCall] };
}

function fromFunctionCallOutputItem(
  item: ResponsesFunctionCall,
  toolOutputByCallId: Map<string, ResponsesFunctionCallOutput>,
): ToolModelMessage | undefined {
  const output = toolOutputByCallId.get(item.call_id);
  if (!output) return undefined;

  const result =
    typeof output.output === "string"
      ? parseJsonOrText(output.output)
      : { type: "text" as const, value: output.output.map(fromInputContentPart).join("") };

  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: item.call_id,
        toolName: item.name,
        output: result,
      } satisfies ToolResultPart,
    ],
  };
}

export const convertToResponsesToolSet = (tools: ResponsesTool[] | undefined): ToolSet | undefined =>
  toToolSet(tools, (t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: t.strict,
  }));

export const convertToResponsesToolChoiceOptions = (
  toolChoice: ResponsesToolChoice | undefined,
): { toolChoice?: ToolChoice<ToolSet>; activeTools?: string[] } => {
  if (!toolChoice) return {};

  if (
    toolChoice === "none" ||
    toolChoice === "auto" ||
    toolChoice === "required" ||
    toolChoice === "validated"
  ) {
    // FUTURE: this is right now google specific, which is not supported by AI SDK, until then, we temporarily map it to auto for now https://docs.cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview
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
      (msgItem as Record<string, unknown>)["extra_content"] = result.providerMetadata;
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
  (item as Record<string, unknown>)["extra_content"] = providerMetadata;

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
    (item as Record<string, unknown>)["extra_content"] = providerMetadata;
  }

  return item;
}

export function toResponsesUsage(usage: LanguageModelUsage): ResponsesUsage {
  const mapped = mapLanguageModelUsage(usage);

  const result: ResponsesUsage = {
    input_tokens: mapped.prompt_tokens,
    output_tokens: mapped.completion_tokens,
    total_tokens: mapped.total_tokens,
  };

  if (mapped.cached_tokens !== undefined) {
    result.input_tokens_details = { cached_tokens: mapped.cached_tokens };
  }

  if (mapped.reasoning_tokens !== undefined) {
    result.output_tokens_details = { reasoning_tokens: mapped.reasoning_tokens };
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
        (messageItem as Record<string, unknown>)["extra_content"] = providerMetadata;
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

    const initReasoningItem = (
      controller: TransformStreamDefaultController<ResponsesStreamEvent | SseErrorFrame>,
      providerMetadata?: SharedV3ProviderMetadata,
    ) => {
      if (reasoningItem) return;

      reasoningItem = {
        type: "reasoning",
        id: uuidv7(),
        status: "in_progress",
        summary: [],
      };

      if (providerMetadata) {
        (reasoningItem as Record<string, unknown>)["extra_content"] = providerMetadata;
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
          data: createResponse("in_progress", null, null),
        });

        controller.enqueue({
          event: "response.in_progress",
          data: createResponse("in_progress", null, null),
        });
      },

      transform(part, controller) {
        // We explicitly omit several stream part types from the AI SDK:
        // - 'text-end': Item closure is handled generically on 'finish' / 'finish-step'
        // - 'tool-input-*' ('start', 'delta', 'end'): The AI SDK streams tool arguments chunk-by-chunk, but our API schema requires sending the fully-formed tool call at once. We ignore the chunks and wait for the final 'tool-call' event.
        // - 'tool-result', 'tool-error', 'tool-output-denied': These only occur if the server executes the tools on behalf of the user. Our gateway only relays the model's request to call a tool back to the client.
        // - 'start', 'start-step': Metadata events that do not map to our output items.
        // - 'abort': Stream cancellation is handled at the network/abort-controller level.
        // - 'source', 'file': No current schema support in the Responses format.
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "reasoning-start": {
            initReasoningItem(controller, part.providerMetadata);
            break;
          }

          case "reasoning-delta": {
            initReasoningItem(controller);

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
            initMessageItem(controller);

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

            const eventName = status === "failed" ? "response.failed" : "response.completed";
            controller.enqueue({
              event: eventName,
              data: finalResponse,
            });
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
