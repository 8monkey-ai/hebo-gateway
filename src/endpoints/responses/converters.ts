import type { SharedV3ProviderMetadata, JSONObject } from "@ai-sdk/provider";
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
  TextPart,
  ImagePart,
  FilePart,
} from "ai";

import { Output, jsonSchema, tool } from "ai";
import { z } from "zod";

import type { TextCallOptions } from "../chat-completions/converters";

import type {
  ResponsesInputs,
  ResponsesInputItem,
  ResponsesInputContentPart,
  ResponsesTool,
  ResponsesToolChoice,
  ResponsesReasoningConfig,
  ResponsesReasoningEffort,
  ResponsesCacheControl,
  ResponsesResponse,
  ResponsesOutputItem,
  ResponsesMessageOutputItem,
  ResponsesFunctionCallOutput,
  ResponsesReasoningOutputItem,
  ResponsesOutputTextPart,
  ResponsesUsage,
  ResponsesStatus,
  ResponsesServiceTier,
  ResponsesStream,
  ResponsesStreamEvent,
  ResponsesReasoningDetail,
} from "./schema";
import { ResponsesTextFormatSchema } from "./schema";
import type { SseErrorFrame, SseFrame } from "../../utils/stream";

import { GatewayError } from "../../errors/gateway";
import { toResponse } from "../../utils/response";
import { parseDataUrl } from "../../utils/url";

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
    reasoning,
    prompt_cache_key,
    extra_body,
    cache_control,
    ...rest
  } = params;

  Object.assign(rest, parseReasoningOptions(reasoning));
  Object.assign(rest, parsePromptCachingOptions(prompt_cache_key, cache_control));

  if (extra_body) {
    for (const v of Object.values(extra_body)) {
      Object.assign(rest, v);
    }
  }

  const { toolChoice, activeTools } = convertToToolChoiceOptions(tool_choice);

  return {
    messages: convertToModelMessages(input, instructions),
    tools: convertToToolSet(tools),
    toolChoice,
    activeTools,
    output: convertToOutput(text?.format),
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

type TextFormat = z.infer<typeof ResponsesTextFormatSchema>;

function convertToOutput(format: TextFormat | undefined) {
  if (!format || format.type === "text") {
    return;
  }

  return Output.object({
    name: format.name,
    description: format.description,
    schema: jsonSchema(format.schema),
  });
}

export function convertToModelMessages(
  input: string | ResponsesInputItem[],
  instructions?: string,
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }

  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }

  // Index function_call items by call_id for tool name lookup
  const fnCallByCallId = new Map<string, { name: string; id?: string }>();
  for (const item of input) {
    if ("type" in item && item.type === "function_call") {
      fnCallByCallId.set(item.call_id, { name: item.name, id: item.id });
    }
  }

  // Group consecutive function_call items into assistant messages
  // and function_call_output items into tool messages
  let pendingToolCalls: ToolCallPart[] = [];
  let pendingToolResults: ToolResultPart[] = [];

  const flushToolCalls = () => {
    if (pendingToolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: pendingToolCalls,
      } satisfies AssistantModelMessage);
      pendingToolCalls = [];
    }
  };

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      messages.push({
        role: "tool",
        content: pendingToolResults,
      } satisfies ToolModelMessage);
      pendingToolResults = [];
    }
  };

  for (const item of input) {
    if ("type" in item && item.type === "function_call") {
      flushToolResults();
      pendingToolCalls.push({
        type: "tool-call",
        toolCallId: item.call_id,
        toolName: item.name,
        input: parseJsonOrText(item.arguments).value,
      });
      continue;
    }

    if ("type" in item && item.type === "function_call_output") {
      flushToolCalls();
      const fn = fnCallByCallId.get(item.call_id);
      pendingToolResults.push({
        type: "tool-result",
        toolCallId: item.call_id,
        toolName: fn?.name ?? "unknown",
        output: parseJsonOrText(item.output),
      });
      continue;
    }

    // Message item (typed or easy)
    flushToolCalls();
    flushToolResults();

    const role = item.role;
    const content = item.content;
    const itemCacheControl = "cache_control" in item ? item.cache_control : undefined;

    if (role === "system" || role === "developer") {
      const msg: ModelMessage = {
        role: "system",
        content: typeof content === "string" ? content : contentPartsToText(content),
      };
      if (itemCacheControl) {
        msg.providerOptions = { unknown: { cache_control: itemCacheControl } };
      }
      messages.push(msg);
    } else if (role === "user") {
      const msg: ModelMessage = {
        role: "user",
        content: typeof content === "string" ? content : fromInputContentParts(content),
      };
      if (itemCacheControl) {
        msg.providerOptions = { unknown: { cache_control: itemCacheControl } };
      }
      messages.push(msg);
    } else if (role === "assistant") {
      const parts: AssistantContent = toAssistantParts(content);
      const msg: AssistantModelMessage = {
        role: "assistant",
        content: parts.length > 0 ? parts : typeof content === "string" ? content : "",
      };
      if (itemCacheControl) {
        msg.providerOptions = { unknown: { cache_control: itemCacheControl } };
      }
      messages.push(msg);
    }
  }

  flushToolCalls();
  flushToolResults();

  return messages;
}

function toAssistantParts(content: string | ResponsesInputContentPart[]): AssistantContent {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  const parts: AssistantContent = [];
  for (const part of content) {
    if (part.type === "output_text" || part.type === "input_text") {
      parts.push({ type: "text", text: part.text });
    }
  }
  return parts;
}

function contentPartsToText(parts: ResponsesInputContentPart[]): string {
  return parts
    .filter((p) => p.type === "input_text" || p.type === "output_text")
    .map((p) => ("text" in p ? p.text : ""))
    .join("");
}

export function fromInputContentParts(content: ResponsesInputContentPart[]): UserContent {
  return content.map((part) => {
    switch (part.type) {
      case "input_text":
      case "output_text": {
        const out: TextPart = { type: "text", text: part.text };
        if ("cache_control" in part && part.cache_control) {
          out.providerOptions = { unknown: { cache_control: part.cache_control } };
        }
        return out;
      }
      case "input_image":
        return fromImageUrlPart(
          part.image_url,
          "cache_control" in part ? part.cache_control : undefined,
        );
      case "input_file":
        return fromFilePart(
          part.file_data,
          part.media_type ?? inferMediaType(part.filename),
          part.filename,
          "cache_control" in part ? part.cache_control : undefined,
        );
      case "input_audio":
        return fromFilePart(
          part.data,
          `audio/${part.format}`,
          undefined,
          "cache_control" in part ? part.cache_control : undefined,
        );
      default:
        throw new Error(`Unhandled content part type: ${(part as { type: string }).type}`);
    }
  });
}

function fromImageUrlPart(url: string, cacheControl?: ResponsesCacheControl) {
  if (url.startsWith("data:")) {
    const { mimeType, dataStart } = parseDataUrl(url);
    if (!mimeType || dataStart <= "data:".length || dataStart >= url.length) {
      throw new GatewayError("Invalid data URL", 400);
    }
    return fromFilePart(url.slice(dataStart), mimeType, undefined, cacheControl);
  }

  const out: ImagePart = {
    type: "image" as const,
    image: new URL(url),
  };
  if (cacheControl) {
    out.providerOptions = { unknown: { cache_control: cacheControl } };
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
      out.providerOptions = { unknown: { cache_control: cacheControl } };
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
    out.providerOptions = { unknown: { cache_control: cacheControl } };
  }
  return out;
}

function inferMediaType(filename?: string): string {
  if (!filename) return "application/octet-stream";
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  const ext = filename.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
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
): {
  toolChoice?: ToolChoice<ToolSet>;
  activeTools?: Array<keyof ToolSet>;
} => {
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

function parseReasoningOptions(reasoning: ResponsesReasoningConfig | undefined) {
  if (!reasoning) return {};

  const effort = reasoning.effort;

  if (reasoning.enabled === false || effort === "none") {
    return { reasoning: { enabled: false }, reasoning_effort: "none" };
  }

  const out: {
    reasoning: ResponsesReasoningConfig;
    reasoning_effort?: ResponsesReasoningEffort;
  } = { reasoning: {} };

  if (effort) {
    out.reasoning.enabled = true;
    out.reasoning.effort = effort;
    out.reasoning_effort = effort;
  }
  if (reasoning.max_tokens) {
    out.reasoning.enabled = true;
    out.reasoning.max_tokens = reasoning.max_tokens;
  }
  if (out.reasoning.enabled) {
    out.reasoning.exclude = reasoning.exclude;
    if (reasoning.summary) {
      out.reasoning.summary = reasoning.summary;
    }
  }

  return out;
}

function parsePromptCachingOptions(
  prompt_cache_key: string | undefined,
  cache_control: ResponsesCacheControl | undefined,
) {
  const out: Record<string, unknown> = {};

  if (prompt_cache_key) out["prompt_cache_key"] = prompt_cache_key;
  if (cache_control) out["cache_control"] = cache_control;

  return out;
}

// --- Response Flow ---

export function toResponse_(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
): ResponsesResponse {
  const now = Math.floor(Date.now() / 1000);
  const output = toOutputItems(result);
  const status = toResponseStatus(result.finishReason, output);

  return {
    id: "resp_" + crypto.randomUUID(),
    object: "response",
    status,
    model,
    output,
    usage: result.totalUsage ? toResponsesUsage(result.totalUsage) : null,
    incomplete_details:
      status === "incomplete" ? { reason: toIncompleteReason(result.finishReason) } : null,
    created_at: now,
    completed_at: status === "completed" || status === "incomplete" ? now : null,
    service_tier: resolveResponseServiceTier(result.providerMetadata),
    provider_metadata: result.providerMetadata,
  };
}

export function toResponsesHttpResponse(
  result: GenerateTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toResponse_(result, model), responseInit);
}

export function toResponsesStream(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
): ResponsesStream {
  return result.fullStream.pipeThrough(new ResponsesTransformStream(model));
}

export function toResponsesStreamResponse(
  result: StreamTextResult<ToolSet, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toResponsesStream(result, model), responseInit);
}

function toOutputItems(result: GenerateTextResult<ToolSet, Output.Output>): ResponsesOutputItem[] {
  const items: ResponsesOutputItem[] = [];

  // Reasoning items
  const reasoningParts = result.content.filter((p) => p.type === "reasoning");
  if (reasoningParts.length > 0) {
    const summaryTexts: { type: "summary_text"; text: string }[] = [];
    for (const part of reasoningParts) {
      if (part.text) {
        summaryTexts.push({ type: "summary_text", text: part.text });
      }
    }
    items.push({
      type: "reasoning",
      id: "rs_" + crypto.randomUUID(),
      summary: summaryTexts.length > 0 ? summaryTexts : undefined,
    } satisfies ResponsesReasoningOutputItem);
  }

  // Message item
  const textParts = result.content.filter((p) => p.type === "text");
  if (textParts.length > 0 || (!result.toolCalls?.length && reasoningParts.length === 0)) {
    const contentParts: ResponsesOutputTextPart[] = [];
    let extraContent: SharedV3ProviderMetadata | undefined;
    const reasoningDetails: ResponsesReasoningDetail[] = [];

    for (const part of textParts) {
      contentParts.push({
        type: "output_text",
        text: part.text,
        annotations: [],
      });
      if (part.providerMetadata) {
        extraContent = part.providerMetadata;
      }
    }

    for (const part of reasoningParts) {
      reasoningDetails.push(
        toReasoningDetail(part, `reasoning-${crypto.randomUUID()}`, reasoningDetails.length),
      );
    }

    if (contentParts.length === 0) {
      contentParts.push({ type: "output_text", text: "", annotations: [] });
    }

    const msgItem: ResponsesMessageOutputItem = {
      type: "message",
      id: "msg_" + crypto.randomUUID(),
      role: "assistant",
      status: "completed",
      content: contentParts,
    };

    if (reasoningDetails.length > 0) {
      msgItem.reasoning_details = reasoningDetails;
    }
    if (extraContent) {
      msgItem.extra_content = extraContent;
    }

    items.push(msgItem);
  }

  // Function call items
  if (result.toolCalls?.length) {
    for (const tc of result.toolCalls) {
      const fcItem: ResponsesFunctionCallOutput = {
        type: "function_call",
        id: "fc_" + crypto.randomUUID(),
        call_id: tc.toolCallId,
        name: normalizeToolName(tc.toolName),
        arguments:
          typeof tc.input === "string" ? tc.input : JSON.stringify(stripEmptyKeys(tc.input)),
        status: "completed",
      };
      if (tc.providerMetadata) {
        fcItem.extra_content = tc.providerMetadata;
      }
      items.push(fcItem);
    }
  }

  return items;
}

function toReasoningDetail(
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
    if (cached !== undefined) out.input_tokens_details.cached_tokens = cached;
    if (cacheWrite !== undefined) out.input_tokens_details.cache_write_tokens = cacheWrite;
  }

  return out;
}

function toResponseStatus(
  finishReason: FinishReason,
  _output: ResponsesOutputItem[],
): ResponsesStatus {
  if (finishReason === "error") return "failed";
  if (finishReason === "length" || finishReason === "content-filter") return "incomplete";
  // If there are function calls, still "completed" (caller handles next turn)
  return "completed";
}

function toIncompleteReason(finishReason: FinishReason): string {
  if (finishReason === "length") return "max_output_tokens";
  if (finishReason === "content-filter") return "content_filter";
  return "unknown";
}

function resolveResponseServiceTier(
  providerMetadata: SharedV3ProviderMetadata | undefined,
): ResponsesServiceTier | undefined {
  if (!providerMetadata) return;

  for (const metadata of Object.values(providerMetadata)) {
    const tier = parseReturnedServiceTier(
      metadata["service_tier"] ??
        (metadata["usage_metadata"] as JSONObject | undefined)?.["traffic_type"],
    );
    if (tier) return tier;
  }
}

function parseReturnedServiceTier(value: unknown): ResponsesServiceTier | undefined {
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

// --- Stream Transform ---

type StreamController = TransformStreamDefaultController<
  SseFrame<ResponsesStreamEvent> | SseErrorFrame
>;

function emitEvent(controller: StreamController, event: ResponsesStreamEvent) {
  controller.enqueue({ event: event.type, data: event });
}

export class ResponsesTransformStream extends TransformStream<
  TextStreamPart<ToolSet>,
  SseFrame<ResponsesStreamEvent> | SseErrorFrame
> {
  constructor(model: string) {
    const responseId = `resp_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);

    let started = false;
    let outputIndex = 0;
    let messageItemId: string | undefined;
    let messageContentStarted = false;
    let accumulatedText = "";
    let finishProviderMetadata: SharedV3ProviderMetadata | undefined;

    const buildResponse = (
      status: ResponsesStatus,
      output: ResponsesOutputItem[],
      usage: ResponsesUsage | null,
      providerMetadata?: SharedV3ProviderMetadata,
    ): ResponsesResponse => ({
      id: responseId,
      object: "response",
      status,
      model,
      output,
      usage,
      incomplete_details: null,
      created_at: createdAt,
      completed_at:
        status === "completed" || status === "incomplete" ? Math.floor(Date.now() / 1000) : null,
      service_tier: resolveResponseServiceTier(providerMetadata),
      provider_metadata: providerMetadata,
    });

    const ensureStarted = (controller: StreamController) => {
      if (started) return;
      started = true;
      const resp = buildResponse("in_progress", [], null);
      emitEvent(controller, { type: "response.created", response: resp });
      emitEvent(controller, { type: "response.in_progress", response: resp });
    };

    const ensureMessageItem = (controller: StreamController) => {
      if (messageItemId) return;
      messageItemId = "msg_" + crypto.randomUUID();
      const item: ResponsesMessageOutputItem = {
        type: "message",
        id: messageItemId,
        role: "assistant",
        status: "in_progress",
        content: [],
      };
      emitEvent(controller, {
        type: "response.output_item.added",
        output_index: outputIndex,
        item,
      });
    };

    const ensureContentPart = (controller: StreamController) => {
      if (messageContentStarted) return;
      messageContentStarted = true;
      emitEvent(controller, {
        type: "response.content_part.added",
        item_id: messageItemId!,
        output_index: outputIndex,
        content_index: 0,
        part: { type: "output_text", text: "" },
      });
    };

    super({
      transform(part, controller) {
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "text-delta": {
            ensureStarted(controller);
            ensureMessageItem(controller);
            ensureContentPart(controller);
            accumulatedText += part.text;
            emitEvent(controller, {
              type: "response.output_text.delta",
              item_id: messageItemId!,
              output_index: outputIndex,
              content_index: 0,
              delta: part.text,
            });
            break;
          }

          case "reasoning-delta": {
            ensureStarted(controller);
            // Reasoning deltas are accumulated but not emitted as separate items
            // in the streaming response (they appear in the final message)
            break;
          }

          case "tool-call": {
            ensureStarted(controller);

            // Close message item if open
            if (messageItemId && messageContentStarted) {
              const textPart: ResponsesOutputTextPart = {
                type: "output_text",
                text: accumulatedText,
                annotations: [],
              };
              emitEvent(controller, {
                type: "response.output_text.done",
                item_id: messageItemId,
                output_index: outputIndex,
                content_index: 0,
                text: accumulatedText,
              });
              emitEvent(controller, {
                type: "response.content_part.done",
                item_id: messageItemId,
                output_index: outputIndex,
                content_index: 0,
                part: textPart,
              });
              emitEvent(controller, {
                type: "response.output_item.done",
                output_index: outputIndex,
                item: {
                  type: "message",
                  id: messageItemId,
                  role: "assistant",
                  status: "completed",
                  content: [textPart],
                },
              });
              outputIndex++;
              messageItemId = undefined;
              messageContentStarted = false;
            }

            const fcId = "fc_" + crypto.randomUUID();
            const args =
              typeof part.input === "string"
                ? part.input
                : JSON.stringify(stripEmptyKeys(part.input));
            const fcItem: ResponsesFunctionCallOutput = {
              type: "function_call",
              id: fcId,
              call_id: part.toolCallId,
              name: normalizeToolName(part.toolName),
              arguments: args,
              status: "completed",
            };

            emitEvent(controller, {
              type: "response.output_item.added",
              output_index: outputIndex,
              item: fcItem,
            });
            emitEvent(controller, {
              type: "response.function_call_arguments.delta",
              item_id: fcId,
              output_index: outputIndex,
              delta: args,
            });
            emitEvent(controller, {
              type: "response.function_call_arguments.done",
              item_id: fcId,
              output_index: outputIndex,
              arguments: args,
            });
            emitEvent(controller, {
              type: "response.output_item.done",
              output_index: outputIndex,
              item: fcItem,
            });
            outputIndex++;
            break;
          }

          case "finish-step": {
            finishProviderMetadata = part.providerMetadata;
            break;
          }

          case "finish": {
            ensureStarted(controller);

            // Close message item if open
            const finalOutput: ResponsesOutputItem[] = [];
            if (messageItemId) {
              const textPart: ResponsesOutputTextPart = {
                type: "output_text",
                text: accumulatedText,
                annotations: [],
              };
              if (messageContentStarted) {
                emitEvent(controller, {
                  type: "response.output_text.done",
                  item_id: messageItemId,
                  output_index: outputIndex,
                  content_index: 0,
                  text: accumulatedText,
                });
                emitEvent(controller, {
                  type: "response.content_part.done",
                  item_id: messageItemId,
                  output_index: outputIndex,
                  content_index: 0,
                  part: textPart,
                });
              }
              const msgItem: ResponsesMessageOutputItem = {
                type: "message",
                id: messageItemId,
                role: "assistant",
                status: "completed",
                content: [textPart],
              };
              emitEvent(controller, {
                type: "response.output_item.done",
                output_index: outputIndex,
                item: msgItem,
              });
              finalOutput.push(msgItem);
            }

            const status = toResponseStatus(part.finishReason, finalOutput);
            const usage = toResponsesUsage(part.totalUsage);
            const resp = buildResponse(status, finalOutput, usage, finishProviderMetadata);
            if (status === "incomplete") {
              resp.incomplete_details = {
                reason: toIncompleteReason(part.finishReason),
              };
            }

            emitEvent(controller, {
              type: status === "failed" ? "response.failed" : "response.completed",
              response: resp,
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
