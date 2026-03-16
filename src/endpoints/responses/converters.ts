import type {
  SharedV3ProviderOptions,
  SharedV3ProviderMetadata,
  JSONObject,
} from "@ai-sdk/provider";
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
  JSONValue,
  AssistantModelMessage,
  ToolModelMessage,
  UserModelMessage,
  ImagePart,
  FilePart,
} from "ai";

import { Output, jsonSchema, tool } from "ai";
import { z } from "zod";

import type {
  ResponseInputItem,
  MessageItemUnion,
  ResponseFunctionToolCall,
  FunctionCallOutput,
  ResponseReasoningItem,
  ResponseOutputText,
  ResponseOutputMessage,
  ResponseOutputItem,
  ResponsesInputs,
  Responses,
  ResponsesUsage,
  ResponsesStatus,
  ResponsesStream,
  ResponsesStreamEvent,
  ResponsesToolChoice,
  ResponsesTool,
  ResponsesTextConfig,
} from "./schema";

import type {
  ChatCompletionsCacheControl,
  ChatCompletionsReasoningEffort,
  ChatCompletionsReasoningConfig,
  ChatCompletionsServiceTier,
} from "../chat-completions/schema";

import type { SseErrorFrame } from "../../utils/stream";

import { GatewayError } from "../../errors/gateway";
import { toResponse } from "../../utils/response";
import { parseDataUrl } from "../../utils/url";

export type TextCallOptions = {
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  output?: Output.Output;
  temperature?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  topP?: number;
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
    reasoning_effort,
    reasoning,
    prompt_cache_key,
    extra_body,
    cache_control,
    ...rest
  } = params;

  Object.assign(rest, parseReasoningOptions(reasoning_effort, reasoning));
  Object.assign(rest, parsePromptCachingOptions(prompt_cache_key, cache_control));

  if (extra_body) {
    for (const v of Object.values(extra_body)) {
      Object.assign(rest, v);
    }
  }

  const { toolChoice: tc } = convertToToolChoiceOptions(tool_choice);

  return {
    messages: convertToModelMessages(input, instructions),
    tools: convertToToolSet(tools),
    toolChoice: tc,
    output: convertToOutput(text),
    temperature,
    maxOutputTokens: max_output_tokens,
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
  input: string | ResponseInputItem[],
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
      // Reasoning items don't map directly to model messages in request flow;
      // they are context items the model already produced.
      continue;
    }
  }

  return modelMessages;
}

function indexToolOutputs(items: ResponseInputItem[]) {
  const map = new Map<string, FunctionCallOutput>();
  for (const item of items) {
    if (item.type === "function_call_output") {
      map.set(item.call_id, item);
    }
  }
  return map;
}

function fromMessageItem(item: MessageItemUnion): ModelMessage {
  switch (item.role) {
    case "system":
    case "developer":
      return {
        role: "system",
        content: typeof item.content === "string" ? item.content : item.content.map(fromInputContentPart).join(""),
      };
    case "user":
      return fromUserMessageItem(item);
    case "assistant":
      return fromAssistantMessageItem(item);
  }
}

function fromUserMessageItem(
  item: MessageItemUnion & { role: "user" },
): UserModelMessage {
  if (typeof item.content === "string") {
    return { role: "user", content: item.content };
  }

  const content: UserContent = [];
  for (const part of item.content) {
    switch (part.type) {
      case "input_text":
        content.push({ type: "text", text: part.text });
        break;
      case "input_image": {
        const url = part.image_url ?? part.file_id;
        if (url) {
          content.push(fromImageInput(url));
        }
        break;
      }
      case "input_file": {
        const data = part.file_data ?? part.file_url ?? part.file_id;
        if (data) {
          content.push(fromFileInput(data, part.filename));
        }
        break;
      }
    }
  }

  return { role: "user", content };
}

function fromImageInput(
  url: string,
): ImagePart | FilePart {
  if (url.startsWith("data:")) {
    const { mimeType, dataStart } = parseDataUrl(url);
    if (!mimeType || dataStart <= "data:".length || dataStart >= url.length) {
      throw new GatewayError("Invalid data URL", 400);
    }
    const base64Data = url.slice(dataStart);
    return {
      type: "image",
      image: z.util.base64ToUint8Array(base64Data),
      mediaType: mimeType,
    };
  }

  return {
    type: "image",
    image: new URL(url),
  };
}

function fromFileInput(
  data: string,
  filename?: string,
): FilePart {
  return {
    type: "file",
    data: z.util.base64ToUint8Array(data),
    filename,
    mediaType: "application/octet-stream",
  };
}

function fromInputContentPart(
  part: { type: string; text?: string },
): string {
  if ("text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

function fromAssistantMessageItem(
  item: MessageItemUnion & { role: "assistant" },
): AssistantModelMessage {
  if (typeof item.content === "string") {
    return { role: "assistant", content: item.content };
  }

  const parts: AssistantContent = [];
  for (const part of item.content) {
    if (part.type === "output_text") {
      parts.push({ type: "text", text: part.text });
    }
  }

  return { role: "assistant", content: parts.length > 0 ? parts : "" };
}

function fromFunctionCallItem(
  item: ResponseFunctionToolCall,
): AssistantModelMessage {
  const toolCall: ToolCallPart = {
    type: "tool-call",
    toolCallId: item.call_id,
    toolName: item.name,
    input: parseJsonOrText(item.arguments).value,
  };
  return { role: "assistant", content: [toolCall] };
}

function fromFunctionCallOutputItem(
  item: ResponseFunctionToolCall,
  toolOutputByCallId: Map<string, FunctionCallOutput>,
): ToolModelMessage | undefined {
  const output = toolOutputByCallId.get(item.call_id);
  if (!output) return undefined;

  const result = typeof output.output === "string"
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
): { toolChoice?: ToolChoice<ToolSet> } => {
  if (!toolChoice) return {};

  if (toolChoice === "none" || toolChoice === "auto" || toolChoice === "required") {
    return { toolChoice };
  }

  return {
    toolChoice: {
      type: "tool",
      toolName: toolChoice.name,
    },
  };
};

function parseJsonOrText(
  content: string,
): { type: "json"; value: JSONValue } | { type: "text"; value: string } {
  try {
    // oxlint-disable-next-line no-unsafe-assignment
    return { type: "json", value: JSON.parse(content) };
  } catch {
    return { type: "text", value: content };
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

  const out: {
    reasoning: ChatCompletionsReasoningConfig;
    reasoning_effort?: ChatCompletionsReasoningEffort;
  } = { reasoning: {} };

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

function parsePromptCachingOptions(
  prompt_cache_key: string | undefined,
  cache_control: ChatCompletionsCacheControl | undefined,
) {
  const out: Record<string, unknown> = {};

  if (prompt_cache_key) out["prompt_cache_key"] = prompt_cache_key;
  if (cache_control) out["cache_control"] = cache_control;

  return out;
}

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
    id: "resp_" + crypto.randomUUID(),
    object: "response",
    status,
    model,
    output,
    usage: result.totalUsage ? toResponsesUsage(result.totalUsage) : null,
    incomplete_details:
      status === "incomplete"
        ? { reason: toIncompleteReason(result.finishReason) }
        : null,
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

function toOutputItems(
  result: GenerateTextResult<ToolSet, Output.Output>,
): ResponseOutputItem[] {
  const output: ResponseOutputItem[] = [];

  // Add reasoning items
  for (const part of result.content) {
    if (part.type === "reasoning") {
      output.push(toReasoningOutputItem(part));
    }
  }

  // Add function call items
  if (result.toolCalls && result.toolCalls.length > 0) {
    for (const tc of result.toolCalls) {
      output.push({
        type: "function_call",
        id: "fc_" + crypto.randomUUID(),
        call_id: tc.toolCallId,
        name: normalizeToolName(tc.toolName),
        arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(stripEmptyKeys(tc.input)),
        status: "completed",
      });
    }
  }

  // Add message output item
  const textParts: ResponseOutputText[] = [];
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
    output.push({
      type: "message",
      id: "msg_" + crypto.randomUUID(),
      role: "assistant",
      status: "completed",
      content: textParts.length > 0 ? textParts : [{ type: "output_text", text: "", annotations: [] }],
    });
  }

  return output;
}

function toReasoningOutputItem(reasoning: ReasoningOutput): ResponseReasoningItem {
  const item: ResponseReasoningItem = {
    type: "reasoning",
    id: "rs_" + crypto.randomUUID(),
    summary: [],
    status: "completed",
  };

  if (reasoning.text) {
    item.summary = [{ type: "summary_text", text: reasoning.text }];
  }

  const providerMetadata = reasoning.providerMetadata ?? {};
  for (const metadata of Object.values(providerMetadata)) {
    if (metadata && typeof metadata === "object" && "redactedData" in metadata && typeof metadata["redactedData"] === "string") {
      item.encrypted_content = metadata["redactedData"];
    }
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

function resolveResponseServiceTier(
  providerMetadata: SharedV3ProviderMetadata | undefined,
): ChatCompletionsServiceTier | undefined {
  if (!providerMetadata) return;

  for (const metadata of Object.values(providerMetadata)) {
    const tier = parseReturnedServiceTier(
      metadata["service_tier"] ??
        (metadata["usage_metadata"] as JSONObject | undefined)?.["traffic_type"],
    );
    if (tier) return tier;
  }
}

function parseReturnedServiceTier(value: unknown): ChatCompletionsServiceTier | undefined {
  if (typeof value !== "string") return undefined;

  const n = value.toLowerCase();
  switch (n) {
    case "traffic_type_unspecified":
    case "auto":
      return "auto";
    case "default":
    case "on_demand":
    case "on-demand":
    case "shared":
      return "default";
    case "on_demand_flex":
    case "flex":
      return "flex";
    case "on_demand_priority":
    case "priority":
    case "performance":
      return "priority";
    case "provisioned_throughput":
    case "scale":
    case "reserved":
    case "dedicated":
    case "provisioned":
    case "throughput":
      return "scale";
    default:
      return undefined;
  }
}

function normalizeToolName(name: string): string {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    if (out.length === 128) break;
    // oxlint-disable-next-line unicorn/prefer-code-point
    const c = name.charCodeAt(i);
    if (
      (c >= 48 && c <= 57) ||
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      c === 95 ||
      c === 45 ||
      c === 46
    ) {
      out += name[i];
    } else {
      out += "_";
    }
  }
  return out;
}

function stripEmptyKeys(obj: unknown) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  delete (obj as Record<string, unknown>)[""];
  return obj;
}

// --- Streaming ---

export class ResponsesTransformStream extends TransformStream<
  TextStreamPart<ToolSet>,
  ResponsesStreamEvent | SseErrorFrame
> {
  constructor(model: string, metadata?: Record<string, string> | null) {
    const responseId = `resp_${crypto.randomUUID()}`;
    const creationTime = Math.floor(Date.now() / 1000);
    let outputIndex = 0;
    let messageItem: ResponseOutputMessage | undefined;
    let messageOutputIndex = -1;
    let contentIndex = 0;
    let finishProviderMetadata: SharedV3ProviderMetadata | undefined;

    const baseResponse = (): Responses => ({
      id: responseId,
      object: "response",
      status: "incomplete",
      model,
      output: [],
      usage: null,
      created_at: creationTime,
      completed_at: null,
      metadata,
    });

    const ensureMessageItem = (controller: TransformStreamDefaultController<ResponsesStreamEvent | SseErrorFrame>) => {
      if (messageItem) return;

      messageItem = {
        type: "message",
        id: "msg_" + crypto.randomUUID(),
        role: "assistant",
        status: "in_progress",
        content: [],
      };
      messageOutputIndex = outputIndex++;

      controller.enqueue({
        event: "response.output_item.added",
        data: {
          type: "response.output_item.added",
          output_index: messageOutputIndex,
          item: messageItem,
        },
      });
    };

    super({
      start(controller) {
        controller.enqueue({
          event: "response.created",
          data: baseResponse(),
        });

        controller.enqueue({
          event: "response.in_progress",
          data: { ...baseResponse(), status: "incomplete" },
        });
      },

      transform(part, controller) {
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "text-delta": {
            ensureMessageItem(controller);

            if (contentIndex === messageItem!.content.length) {
              const textPart: ResponseOutputText = {
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
            const fnItem: ResponseFunctionToolCall = {
              type: "function_call",
              id: "fc_" + crypto.randomUUID(),
              call_id: part.toolCallId,
              name: normalizeToolName(part.toolName),
              arguments: typeof part.input === "string"
                ? part.input
                : JSON.stringify(stripEmptyKeys(part.input)),
              status: "completed",
            };
            const fnOutputIndex = outputIndex++;

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
            // Close any open message content parts
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

            // Close message item
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
            }

            const status = toResponsesStatus(part.finishReason);
            const usage = part.totalUsage ? toResponsesUsage(part.totalUsage) : null;
            const now = Math.floor(Date.now() / 1000);

            const finalResponse: Responses = {
              ...baseResponse(),
              status,
              usage,
              completed_at: status === "completed" ? now : null,
              incomplete_details:
                status === "incomplete"
                  ? { reason: toIncompleteReason(part.finishReason) }
                  : null,
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
          }
        }
      },
    });
  }
}
