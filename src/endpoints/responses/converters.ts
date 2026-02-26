import type {
  JSONObject,
  SharedV3ProviderMetadata,
  SharedV3ProviderOptions,
} from "@ai-sdk/provider";
import type {
  AssistantContent,
  AssistantModelMessage,
  FilePart,
  FinishReason,
  GenerateTextResult,
  ImagePart,
  JSONValue,
  LanguageModelUsage,
  ModelMessage,
  Output,
  ReasoningOutput,
  StreamTextResult,
  TextPart,
  TextStreamPart,
  ToolCallPart,
  ToolChoice,
  ToolModelMessage,
  ToolResultPart,
  ToolSet,
  UserContent,
  UserModelMessage,
} from "ai";

import { Output as AIOutput, jsonSchema, tool } from "ai";
import { z } from "zod";

import type {
  ResponsesBody,
  ResponsesCacheControl,
  ResponsesFunctionCallOutputPart,
  ResponsesInputFunctionCallItem,
  ResponsesInputFunctionCallOutputItem,
  ResponsesInputContentPart,
  ResponsesInputAssistantMessageItem,
  ResponsesInputItem,
  ResponsesInputTextPart,
  ResponsesInputUserMessageItem,
  ResponsesReasoningConfig,
  ResponsesReasoningDetail,
  ResponsesReasoningEffort,
  ResponsesTextConfig,
  ResponsesStreamEvent,
  ResponsesTool,
  ResponsesToolCall,
  ResponsesToolChoice,
  ResponsesUsage,
  Responses,
  ResponsesOutputMessage,
  ResponsesInputs,
} from "./schema";

import { GatewayError } from "../../errors/gateway";
import { OpenAIError, toOpenAIError } from "../../errors/openai";
import { toResponse } from "../../utils/response";

export type ResponsesTextCallOptions = {
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  activeTools?: Array<keyof ToolSet>;
  output?: Output.Output;
  temperature?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  topP?: number;
  providerOptions: SharedV3ProviderOptions;
};

export function convertToTextCallOptions(params: ResponsesInputs): ResponsesTextCallOptions {
  const {
    input,
    instructions,
    tools,
    tool_choice,
    temperature,
    max_output_tokens,
    max_tokens,
    max_completion_tokens,
    text,
    reasoning_effort,
    reasoning,
    prompt_cache_key,
    prompt_cache_retention,
    cached_content,
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
    parsePromptCachingOptions(
      prompt_cache_key,
      prompt_cache_retention,
      cached_content,
      cache_control,
    ),
  );

  const { toolChoice, activeTools } = convertToToolChoiceOptions(tool_choice);

  return {
    messages: convertToModelMessages(input, instructions),
    tools: convertToToolSet(tools),
    toolChoice,
    activeTools,
    output: convertToOutput(text),
    temperature,
    maxOutputTokens:
      (typeof max_output_tokens === "number" ? max_output_tokens : undefined) ??
      max_completion_tokens ??
      max_tokens,
    frequencyPenalty: frequency_penalty,
    presencePenalty: presence_penalty,
    seed,
    stopSequences: stop ? (Array.isArray(stop) ? stop : [stop]) : undefined,
    topP: top_p,
    providerOptions: {
      unknown: rest as JSONObject,
    },
  };
}

function convertToOutput(textConfig: ResponsesTextConfig | undefined) {
  const responseFormat = textConfig?.format;
  if (!responseFormat || responseFormat.type === "text") {
    return;
  }

  const { name, description, schema } = responseFormat.json_schema;
  return AIOutput.object({
    name,
    description,
    schema: jsonSchema(schema),
  });
}

export function convertToModelMessages(
  input: ResponsesBody["input"],
  instructions?: string,
): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  if (instructions) {
    modelMessages.push({ role: "system", content: instructions });
  }

  if (typeof input === "string") {
    modelMessages.push({ role: "user", content: input });
    return modelMessages;
  }

  const outputByCallId = indexFunctionCallOutputs(input);

  for (const item of input) {
    if (item.type === "function_call_output") continue;

    if (item.type === "message") {
      if (item.role === "system" || item.role === "developer") {
        const systemMessage: ModelMessage = {
          role: "system",
          content: item.content,
        };
        if (item.cache_control) {
          systemMessage.providerOptions = { unknown: { cache_control: item.cache_control } };
        }
        modelMessages.push(systemMessage);
        continue;
      }

      if (item.role === "user") {
        modelMessages.push(fromResponsesUserMessage(item));
        continue;
      }

      const assistantMessage = fromResponsesAssistantMessage(item);
      modelMessages.push(assistantMessage);
      const toolResult = fromResponsesToolResultMessage(item.tool_calls, outputByCallId);
      if (toolResult) modelMessages.push(toolResult);
      continue;
    }

    if (item.type === "function_call") {
      const assistantMessage = fromResponsesFunctionCallItem(item);
      modelMessages.push(assistantMessage);
      const toolResult = fromResponsesToolResultMessage(
        [
          {
            id: item.call_id,
            type: "function",
            function: {
              name: item.name,
              arguments: item.arguments,
            },
          },
        ],
        outputByCallId,
      );
      if (toolResult) modelMessages.push(toolResult);
      continue;
    }

    if (item.type === "item_reference" || item.type === "reasoning") {
      throw new GatewayError(
        `Input item type '${item.type}' is not implemented yet for /responses`,
        400,
        "BAD_REQUEST",
      );
    }
  }

  return modelMessages;
}

function indexFunctionCallOutputs(input: ResponsesInputItem[]) {
  const map = new Map<string, ResponsesInputFunctionCallOutputItem["output"]>();
  for (const item of input) {
    if (item.type === "function_call_output") map.set(item.call_id, item.output);
  }
  return map;
}

export function fromResponsesUserMessage(message: ResponsesInputUserMessageItem): UserModelMessage {
  const out: UserModelMessage = {
    role: "user",
    content: Array.isArray(message.content)
      ? fromResponsesContent(message.content)
      : message.content,
  };
  if (message.cache_control) {
    out.providerOptions = {
      unknown: { cache_control: message.cache_control },
    };
  }
  return out;
}

export function fromResponsesAssistantMessage(
  message: ResponsesInputAssistantMessageItem,
): AssistantModelMessage {
  const { tool_calls, content, extra_content, reasoning_details, cache_control } = message;

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
        ? ([{ type: "input_text", text: content }] as ResponsesInputTextPart[])
        : content;
    for (const part of inputContent) {
      if (part.type === "input_text") {
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
      // eslint-disable-next-line no-shadow
      const { id, function: fn, extra_content } = tc;
      const out: ToolCallPart = {
        type: "tool-call",
        toolCallId: id,
        toolName: fn.name,
        input: parseJsonOrText(fn.arguments).value,
      };
      if (extra_content) {
        out.providerOptions = extra_content as SharedV3ProviderOptions;
      }
      parts.push(out);
    }
  }

  const out: AssistantModelMessage = {
    role: "assistant",
    content: parts.length > 0 ? parts : typeof content === "string" ? content : "",
  };

  if (extra_content) {
    out.providerOptions = extra_content as SharedV3ProviderOptions;
  }

  if (cache_control) {
    ((out.providerOptions ??= { unknown: {} })["unknown"] ??= {})["cache_control"] = cache_control;
  }

  return out;
}

export function fromResponsesToolResultMessage(
  toolCalls: ResponsesToolCall[] | undefined,
  outputByCallId: Map<string, ResponsesInputFunctionCallOutputItem["output"]>,
): ToolModelMessage | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;

  const toolResultParts: ToolResultPart[] = [];
  for (const tc of toolCalls) {
    const output = outputByCallId.get(tc.id);
    if (!output) continue;

    toolResultParts.push({
      type: "tool-result",
      toolCallId: tc.id,
      toolName: tc.function.name,
      output: parseToolResult(output),
    });
  }

  return toolResultParts.length > 0 ? { role: "tool", content: toolResultParts } : undefined;
}

function fromResponsesFunctionCallItem(
  item: ResponsesInputFunctionCallItem,
): AssistantModelMessage {
  const out: ToolCallPart = {
    type: "tool-call",
    toolCallId: item.call_id,
    toolName: item.name,
    input: parseJsonOrText(item.arguments).value,
  };

  return {
    role: "assistant",
    content: [out],
  };
}

export function fromResponsesContent(content: ResponsesInputContentPart[]): UserContent {
  return content.map((part) => {
    switch (part.type) {
      case "input_image":
        return fromImageUrlPart(part.image_url, part.cache_control);
      case "input_file":
        if (!part.file_data && !part.file_url) {
          throw new GatewayError("input_file requires either file_data or file_url", 400);
        }
        if (!part.file_data) {
          return fromImageUrlPart(part.file_url!, part.cache_control);
        }
        return fromFilePart(
          part.file_data,
          "application/octet-stream",
          part.filename,
          part.cache_control,
        );
      case "input_audio":
        return fromFilePart(
          part.input_audio.data,
          `audio/${part.input_audio.format}`,
          undefined,
          part.cache_control,
        );
      case "input_text": {
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
        throw new GatewayError("Unsupported input content part", 400);
    }
  });
}

function fromImageUrlPart(url: string, cacheControl?: ResponsesCacheControl) {
  if (url.startsWith("data:")) {
    const { mimeType, base64Data } = parseDataUrl(url);
    return fromFilePart(base64Data, mimeType, undefined, cacheControl);
  }

  const out: ImagePart = {
    type: "image" as const,
    image: new URL(url),
  };
  if (cacheControl) {
    out.providerOptions = {
      unknown: { cache_control: cacheControl },
    };
  }
  return out;
}

function fromFilePart(
  base64Data: string,
  mediaType: string,
  filename?: string,
  cacheControl?: ResponsesCacheControl,
) {
  if (mediaType.startsWith("image/")) {
    const out: ImagePart = {
      type: "image" as const,
      image: z.util.base64ToUint8Array(base64Data),
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
    data: z.util.base64ToUint8Array(base64Data),
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

export const convertToToolSet = (tools: ResponsesTool[] | undefined): ToolSet | undefined => {
  if (!tools) {
    return;
  }

  const toolSet: ToolSet = {};
  for (const t of tools) {
    if (
      t.type !== "function" ||
      !("function" in t) ||
      typeof t.function !== "object" ||
      t.function === null
    ) {
      continue;
    }
    const fn = t.function as {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
      strict?: boolean;
    };
    toolSet[fn.name] = tool({
      description: fn.description,
      inputSchema: jsonSchema(fn.parameters),
      strict: fn.strict,
    });
  }
  return toolSet;
};

export const convertToToolChoiceOptions = (
  toolChoice: ResponsesToolChoice | undefined,
): {
  toolChoice?: ToolChoice<ToolSet>;
  activeTools?: Array<keyof ToolSet>;
} => {
  if (!toolChoice) {
    return {};
  }

  if (toolChoice === "none" || toolChoice === "auto" || toolChoice === "required") {
    return { toolChoice };
  }

  if (toolChoice === "validated") {
    return { toolChoice: "auto" };
  }

  if (toolChoice.type === "allowed_tools") {
    return {
      toolChoice: toolChoice.allowed_tools.mode,
      activeTools: toolChoice.allowed_tools.tools.map((toolRef) => toolRef.function.name),
    };
  }

  if ("name" in toolChoice) {
    return {
      toolChoice: {
        type: "tool",
        toolName: toolChoice.name,
      },
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
  content:
    | string
    | { type: "text"; text: string }[]
    | { type: "input_text"; text: string }[]
    | { type: "output_text"; text: string }[]
    | ResponsesFunctionCallOutputPart[]
    | Array<{ type: "text" | "input_text" | "output_text"; text: string }>,
): ToolResultPart["output"] {
  if (Array.isArray(content)) {
    return {
      type: "content",
      value: content.map((part) => ({
        type: "text",
        text: "text" in part ? part.text : JSON.stringify(part),
      })),
    };
  }
  return parseJsonOrText(content);
}

function parseJsonOrText(
  content: string,
): { type: "json"; value: JSONValue } | { type: "text"; value: string } {
  try {
    return { type: "json", value: JSON.parse(content) };
  } catch {
    return { type: "text", value: content };
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
  reasoning_effort: ResponsesReasoningEffort | undefined,
  reasoning: ResponsesReasoningConfig | undefined,
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

function parsePromptCachingOptions(
  prompt_cache_key: string | undefined,
  prompt_cache_retention: "in_memory" | "24h" | undefined,
  cached_content: string | undefined,
  cache_control: ResponsesCacheControl | undefined,
) {
  const out: Record<string, unknown> = {};

  const syncedCacheKey = prompt_cache_key ?? cached_content;
  const syncedCachedContent = cached_content ?? prompt_cache_key;

  let syncedCacheRetention = prompt_cache_retention;
  if (!syncedCacheRetention && cache_control?.ttl) {
    syncedCacheRetention = cache_control.ttl === "24h" ? "24h" : "in_memory";
  }

  let syncedCacheControl = cache_control;
  if (!syncedCacheControl && syncedCacheRetention) {
    syncedCacheControl = {
      type: "ephemeral",
      ttl: syncedCacheRetention === "24h" ? "24h" : "5m",
    };
  }

  if (syncedCacheKey) out["prompt_cache_key"] = syncedCacheKey;
  if (syncedCacheRetention) out["prompt_cache_retention"] = syncedCacheRetention;
  if (syncedCachedContent) out["cached_content"] = syncedCachedContent;
  if (syncedCacheControl) out["cache_control"] = syncedCacheControl;

  return out;
}

export function toResponses(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  requestBody?: ResponsesBody,
): Responses {
  const output = toResponsesOutputMessage(result);
  const createdAt = Math.floor(Date.now() / 1000);

  return {
    id: `resp_${crypto.randomUUID()}`,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model,
    output: [output],
    usage: result.totalUsage ? toResponsesUsage(result.totalUsage) : null,
    provider_metadata: result.providerMetadata,
    error: null,
    completed_at: createdAt,
    incomplete_details: null,
    previous_response_id: requestBody?.previous_response_id ?? null,
    instructions: requestBody?.instructions ?? null,
    tools: requestBody?.tools,
    tool_choice: requestBody?.tool_choice,
    parallel_tool_calls: requestBody?.parallel_tool_calls,
    max_output_tokens: requestBody?.max_output_tokens ?? null,
    max_tool_calls: requestBody?.max_tool_calls,
    temperature: requestBody?.temperature ?? null,
    top_p: requestBody?.top_p ?? null,
    truncation: requestBody?.truncation ?? null,
    metadata: requestBody?.metadata,
  };
}

export function toResponsesResponse(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  requestBody?: ResponsesBody,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toResponses(result, model, requestBody), responseInit);
}

export function toResponsesStream<E extends boolean = false>(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  requestBody?: ResponsesBody,
  wrapErrors?: E,
): ReadableStream<ResponsesStreamEvent | (E extends true ? OpenAIError : Error)> {
  return result.fullStream.pipeThrough(new ResponsesStream(model, requestBody, wrapErrors));
}

export function toResponsesStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  requestBody?: ResponsesBody,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toResponsesStream(result, model, requestBody, true), responseInit);
}

export class ResponsesStream<E extends boolean = false> extends TransformStream<
  TextStreamPart<ToolSet>,
  ResponsesStreamEvent | (E extends true ? OpenAIError : Error)
> {
  constructor(model: string, requestBody?: ResponsesBody, wrapErrors?: E) {
    const responseId = `resp_${crypto.randomUUID()}`;
    const messageId = `msg_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const reasoningIdToIndex = new Map<string, number>();
    let finishProviderMetadata: SharedV3ProviderMetadata | undefined;
    let sequenceNumber = 0;

    const output: ResponsesOutputMessage = {
      id: messageId,
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [],
    };

    const responseBase = {
      id: responseId,
      object: "response" as const,
      created_at: createdAt,
      model,
      provider_metadata: undefined as unknown,
      error: null,
      completed_at: null,
      incomplete_details: null,
      previous_response_id: requestBody?.previous_response_id ?? null,
      instructions: requestBody?.instructions ?? null,
      tools: requestBody?.tools,
      tool_choice: requestBody?.tool_choice,
      parallel_tool_calls: requestBody?.parallel_tool_calls,
      max_output_tokens: requestBody?.max_output_tokens ?? null,
      max_tool_calls: requestBody?.max_tool_calls,
      temperature: requestBody?.temperature ?? null,
      top_p: requestBody?.top_p ?? null,
      truncation: requestBody?.truncation ?? null,
      metadata: requestBody?.metadata,
    };

    let outputAdded = false;
    let accumulatedText = "";
    const contentIndex = 0;

    super({
      start(controller) {
        controller.enqueue({
          sequence_number: sequenceNumber++,
          type: "response.created",
          response: {
            ...responseBase,
            status: "in_progress",
            output: [],
            usage: null,
          },
        });
      },
      transform(part, controller) {
        const ensureOutputAdded = () => {
          if (outputAdded) return;
          outputAdded = true;
          controller.enqueue({
            sequence_number: sequenceNumber++,
            type: "response.output_item.added",
            response_id: responseId,
            output_index: 0,
            item: { ...output },
          });
          controller.enqueue({
            sequence_number: sequenceNumber++,
            type: "response.content_part.added",
            response_id: responseId,
            output_index: 0,
            item_id: messageId,
            content_index: contentIndex,
            part: {
              type: "output_text",
              text: "",
              annotations: [],
            },
          });
        };

        switch (part.type) {
          case "text-delta": {
            ensureOutputAdded();
            accumulatedText += part.text;
            controller.enqueue({
              sequence_number: sequenceNumber++,
              type: "response.output_text.delta",
              response_id: responseId,
              output_index: 0,
              item_id: messageId,
              content_index: contentIndex,
              delta: part.text,
            });
            if (part.providerMetadata) {
              output.provider_metadata = part.providerMetadata;
            }
            break;
          }

          case "reasoning-delta": {
            ensureOutputAdded();
            output.reasoning_content = (output.reasoning_content ?? "") + part.text;

            let index = reasoningIdToIndex.get(part.id);
            if (index === undefined) {
              index = reasoningIdToIndex.size;
              reasoningIdToIndex.set(part.id, index);
            }

            output.reasoning_details ??= [];
            output.reasoning_details.push(
              toReasoningDetail(
                {
                  type: "reasoning",
                  text: part.text,
                  providerMetadata: part.providerMetadata,
                },
                part.id,
                index,
              ),
            );
            break;
          }

          case "tool-call": {
            ensureOutputAdded();
            output.tool_calls ??= [];
            output.tool_calls.push(
              toResponsesToolCall(
                part.toolCallId,
                part.toolName,
                part.input,
                part.providerMetadata,
              ),
            );
            break;
          }

          case "finish-step": {
            finishProviderMetadata = part.providerMetadata;
            break;
          }

          case "finish": {
            ensureOutputAdded();
            output.status = "completed";
            output.content = [{ type: "output_text", text: accumulatedText }];

            if (finishProviderMetadata) {
              output.provider_metadata = finishProviderMetadata;
            }

            controller.enqueue({
              sequence_number: sequenceNumber++,
              type: "response.output_text.done",
              response_id: responseId,
              output_index: 0,
              item_id: messageId,
              content_index: contentIndex,
              text: accumulatedText,
            });
            controller.enqueue({
              sequence_number: sequenceNumber++,
              type: "response.content_part.done",
              response_id: responseId,
              output_index: 0,
              item_id: messageId,
              content_index: contentIndex,
              part: {
                type: "output_text",
                text: accumulatedText,
                annotations: [],
              },
            });

            controller.enqueue({
              sequence_number: sequenceNumber++,
              type: "response.output_item.done",
              response_id: responseId,
              output_index: 0,
              item: { ...output },
            });

            controller.enqueue({
              sequence_number: sequenceNumber++,
              type: "response.completed",
              response: {
                ...responseBase,
                status: "completed",
                output: [{ ...output }],
                usage: toResponsesUsage(part.totalUsage),
                provider_metadata: finishProviderMetadata,
                completed_at: Math.floor(Date.now() / 1000),
              },
            });
            break;
          }

          case "error": {
            let err: Error | OpenAIError;
            if (wrapErrors) {
              err = toOpenAIError(part.error);
            } else if (part.error instanceof Error) {
              err = part.error;
            } else {
              err = new Error(String(part.error));
            }
            controller.enqueue(err as E extends true ? OpenAIError : Error);
          }
        }
      },
    });
  }
}

export const toResponsesOutputMessage = (
  result: GenerateTextResult<ToolSet, Output.Output>,
): ResponsesOutputMessage => {
  const message: ResponsesOutputMessage = {
    id: `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    status: "completed",
    content: [],
  };

  if (result.toolCalls && result.toolCalls.length > 0) {
    message.tool_calls = result.toolCalls.map((toolCall) =>
      toResponsesToolCall(
        toolCall.toolCallId,
        toolCall.toolName,
        toolCall.input,
        toolCall.providerMetadata,
      ),
    );
  }

  const reasoningDetails: ResponsesReasoningDetail[] = [];
  let text = "";

  for (const part of result.content) {
    if (part.type === "text") {
      text += part.text;
      if (part.providerMetadata) {
        message.provider_metadata = part.providerMetadata;
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

  message.content = [{ type: "output_text", text }];
  return message;
};

export function toReasoningDetail(
  reasoning: ReasoningOutput,
  id: string,
  index: number,
): ResponsesReasoningDetail {
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

export function toResponsesUsage(usage: LanguageModelUsage): ResponsesUsage {
  const out: ResponsesUsage = {};

  const input = usage.inputTokens;
  if (input !== undefined) out.input_tokens = input;

  const output = usage.outputTokens;
  if (output !== undefined) out.output_tokens = output;

  if (input !== undefined || output !== undefined || usage.totalTokens !== undefined) {
    out.total_tokens = usage.totalTokens ?? (input ?? 0) + (output ?? 0);
  }

  const reasoning = usage.outputTokenDetails?.reasoningTokens;
  if (reasoning !== undefined) out.output_tokens_details = { reasoning_tokens: reasoning };

  const cached = usage.inputTokenDetails?.cacheReadTokens;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens;
  if (cached !== undefined || cacheWrite !== undefined) {
    out.input_tokens_details = {};
    if (cached !== undefined) {
      out.input_tokens_details.cached_tokens = cached;
    }
    if (cacheWrite !== undefined) {
      out.input_tokens_details.cache_write_tokens = cacheWrite;
    }
  }

  return out;
}

export function toResponsesToolCall(
  id: string,
  name: string,
  args: unknown,
  providerMetadata?: SharedV3ProviderMetadata,
): ResponsesToolCall {
  const out: ResponsesToolCall = {
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

function normalizeToolName(name: string): string {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    if (out.length === 128) break;

    // eslint-disable-next-line unicorn/prefer-code-point
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

export const toResponsesFinishReason = (finishReason: FinishReason) => {
  if (finishReason === "error" || finishReason === "other") {
    return "stop";
  }
  return String(finishReason).replaceAll("-", "_");
};
