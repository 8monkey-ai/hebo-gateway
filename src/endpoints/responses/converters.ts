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
} from "../shared/converters";

export type TextCallOptions = {
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  activeTools?: string[];
  output?: Output.Output;
  temperature?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  topP?: number;
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  providerOptions: SharedV3ProviderOptions;
};

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

  if (item.summary && item.summary.length > 0) {
    const extra = (item as Record<string, unknown>)["extra_content"] as
      | Record<string, unknown>
      | undefined;
    for (const s of item.summary) {
      parts.push({
        type: "reasoning",
        text: s.text,
        providerOptions:
          extra || item.encrypted_content
            ? {
                unknown: {
                  ...extra,
                  redactedData: item.encrypted_content,
                },
              }
            : undefined,
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
  if (url.startsWith("data:")) {
    const { mimeType, dataStart } = parseDataUrl(url);
    if (!mimeType || dataStart <= "data:".length || dataStart >= url.length) {
      throw new GatewayError("Invalid data URL", 400);
    }
    const base64Data = url.slice(dataStart);
    try {
      return {
        type: "image",
        image: z.util.base64ToUint8Array(base64Data),
        mediaType: mimeType,
      };
    } catch {
      throw new GatewayError("Invalid base64 data in image URL", 400);
    }
  }

  return {
    type: "image",
    image: parseUrl(url, "Invalid image URL"),
  };
}

function fromFileInput(data: string, filename?: string): FilePart {
  try {
    return {
      type: "file",
      data: z.util.base64ToUint8Array(data),
      filename,
      mediaType: "application/octet-stream",
    };
  } catch {
    throw new GatewayError("Invalid base64 data in file input", 400);
  }
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

export const convertToToolSet = (tools: ResponsesTool[] | undefined): ToolSet | undefined => {
  if (!tools) return;

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
    id: "resp_" + uuidv7(),
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

  for (const metadata of Object.values(providerMetadata)) {
    if (
      metadata &&
      typeof metadata === "object" &&
      "redactedData" in metadata &&
      typeof metadata["redactedData"] === "string"
    ) {
      item.encrypted_content = metadata["redactedData"];
    }
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
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;

  const result: ResponsesUsage = {
    input_tokens: input,
    output_tokens: output,
    total_tokens: usage.totalTokens ?? input + output,
  };

  const cached = usage.inputTokenDetails?.cacheReadTokens;
  if (cached !== undefined) {
    result.input_tokens_details = { cached_tokens: cached };
  }

  const reasoning = usage.outputTokenDetails?.reasoningTokens;
  if (reasoning !== undefined) {
    result.output_tokens_details = { reasoning_tokens: reasoning };
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
    const responseId = `resp_${uuidv7()}`;
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

    const baseResponse = (): Responses => ({
      id: responseId,
      object: "response",
      status: "in_progress",
      model,
      output: [...outputItems],
      usage: null,
      created_at: creationTime,
      completed_at: null,
      metadata,
    });

    const ensureMessageItem = (
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

    const ensureReasoningItem = (
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
        for (const meta of Object.values(providerMetadata)) {
          if (
            meta &&
            typeof meta === "object" &&
            "redactedData" in meta &&
            typeof meta["redactedData"] === "string"
          ) {
            reasoningItem.encrypted_content = meta["redactedData"];
          }
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
          data: baseResponse(),
        });

        controller.enqueue({
          event: "response.in_progress",
          data: baseResponse(),
        });
      },

      transform(part, controller) {
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "reasoning-start": {
            ensureReasoningItem(controller, part.providerMetadata);
            break;
          }

          case "reasoning-delta": {
            ensureReasoningItem(controller);

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
            ensureMessageItem(controller, part.providerMetadata);
            break;
          }

          case "text-delta": {
            ensureMessageItem(controller);

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
              ensureMessageItem(controller);
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

            const finalResponse: Responses = {
              ...baseResponse(),
              status,
              usage,
              completed_at: status === "completed" ? now : null,
              incomplete_details:
                status === "incomplete" ? { reason: toIncompleteReason(part.finishReason) } : null,
              service_tier: resolveResponseServiceTier(finishProviderMetadata),
              provider_metadata: finishProviderMetadata,
            };

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
