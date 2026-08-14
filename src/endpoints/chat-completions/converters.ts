import type { JSONObject, SharedV4ProviderMetadata } from "@ai-sdk/provider";
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
  TextPart,
  FilePart,
} from "ai";
import { Output, jsonSchema, tool } from "ai";

import { GatewayError } from "../../errors/gateway";
import { toResponse } from "../../utils/response";
import type { SseErrorFrame, SseFrame } from "../../utils/stream";
import {
  parseJsonOrText,
  parseReasoningOptions,
  parsePromptCachingOptions,
  resolveResponseServiceTier,
  normalizeToolName,
  stripEmptyKeys,
  parseBase64,
  parseImageInput,
  extractReasoningMetadata,
  GEMINI_REASONING_FORMAT,
  type ReasoningMetadata,
  type RuntimeContext,
  type TextCallOptions,
  type ToolChoiceOptions,
} from "../shared/converters";
import type {
  ChatCompletionsToolCall,
  ChatCompletionsTool,
  ChatCompletionsFunctionTool,
  ChatCompletionsToolChoice,
  ChatCompletionsStream,
  ChatCompletionsContentPart,
  ChatCompletionsMessage,
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
  ChatCompletionsReasoningDetail,
  ChatCompletionsResponseFormat,
  ChatCompletionsContentPartText,
  ChatCompletionsCacheControl,
} from "./schema";

// --- Request Flow ---

export function convertToTextCallOptions(params: ChatCompletionsInputs): TextCallOptions {
  const {
    messages,
    tools,
    tool_choice,
    temperature,
    max_tokens,
    max_completion_tokens,
    response_format,
    reasoning_effort,
    reasoning,
    prompt_cache_key,
    prompt_cache_retention,
    extra_body,
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
    parsePromptCachingOptions(prompt_cache_key, prompt_cache_retention, cache_control),
  );

  if (extra_body) {
    for (const v of Object.values(extra_body)) {
      Object.assign(rest, v);
    }
  }

  const { toolChoice, activeTools } = convertToToolChoiceOptions(tool_choice);

  return {
    messages: convertToModelMessages(messages),
    tools: convertToToolSet(tools),
    toolChoice,
    activeTools,
    output: convertToOutput(response_format),
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

function convertToOutput(
  responseFormat: ChatCompletionsResponseFormat | undefined,
): Output.Output | undefined {
  if (!responseFormat || responseFormat.type === "text") {
    return undefined;
  }

  const { name, description, schema } = responseFormat.json_schema;
  return Output.object({
    name,
    description,
    schema: jsonSchema(schema),
  });
}

export function convertToModelMessages(messages: ChatCompletionsMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  const toolById = indexToolMessages(messages);

  for (const message of messages) {
    if (message.role === "tool") continue;

    if (message.role === "system") {
      const content = Array.isArray(message.content)
        ? message.content.map((p) => p.text).join("")
        : message.content;
      const out: ModelMessage = { role: "system", content };
      if (message.cache_control) {
        out.providerOptions = {
          unknown: { cache_control: message.cache_control },
        };
      }
      modelMessages.push(out);
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
  const out: UserModelMessage = {
    role: "user",
    content: Array.isArray(message.content)
      ? fromChatCompletionsContent(message.content)
      : message.content,
  };
  if (message.cache_control) {
    out.providerOptions = {
      unknown: { cache_control: message.cache_control },
    };
  }
  return out;
}

/** `ai` does not re-export its assistant content part types; narrow them out instead. */
type ReasoningPart = Extract<Exclude<AssistantContent, string>[number], { type: "reasoning" }>;

/**
 * Turns a `reasoning_details` entry's opaque blobs into provider options.
 *
 * Every provider key for a slot is written rather than picking one from `format`:
 * clients routinely flatten the tag, each provider reads only the key it knows, and
 * provider option schemas strip the keys they do not.
 */
function toReasoningOptions(detail: ChatCompletionsReasoningDetail): Record<string, string> {
  const options: Record<string, string> = {};
  if (detail.signature) {
    options["signature"] = detail.signature;
    options["thoughtSignature"] = detail.signature;
  }
  if (detail.data) {
    options["redactedData"] = detail.data;
    options["reasoningEncryptedContent"] = detail.data;
  }
  if (detail.id) options["itemId"] = detail.id;
  return options;
}

export function fromChatCompletionsAssistantMessage(
  message: ChatCompletionsAssistantMessage,
): AssistantModelMessage {
  const { tool_calls, role, content, extra_content, reasoning_details, cache_control } = message;

  const parts: AssistantContent = [];
  /** Gemini thought signatures, keyed by the tool call they belong to. */
  const thoughtSignatures = new Map<string, string>();
  /** Reasoning parts by id, so OpenAI's text and encrypted entries merge back into one. */
  const reasoningById = new Map<string, ReasoningPart>();

  for (const detail of reasoning_details ?? []) {
    // Gemini hangs its thought signature off a tool call rather than a reasoning block,
    // so it travels as an encrypted entry carrying that call's id.
    if (detail.type === "reasoning.encrypted" && detail.format === GEMINI_REASONING_FORMAT) {
      if (detail.id && detail.data) thoughtSignatures.set(detail.id, detail.data);
      continue;
    }

    if (!detail.text && !detail.data) continue;
    const options = toReasoningOptions(detail);

    // OpenAI splits one reasoning item into a text entry and an encrypted entry sharing
    // an id, and wants them back on a single part.
    const existing = detail.id ? reasoningById.get(detail.id) : undefined;
    if (existing) {
      existing.text ||= detail.text ?? "";
      existing.providerOptions = {
        unknown: {
          ...(existing.providerOptions?.["unknown"] as Record<string, string>),
          ...options,
        },
      };
      continue;
    }

    const part: ReasoningPart = { type: "reasoning", text: detail.text ?? "" };
    if (Object.keys(options).length > 0) part.providerOptions = { unknown: options };
    if (detail.id) reasoningById.set(detail.id, part);
    parts.push(part);
  }

  let lastTextPart: TextPart | undefined;
  if (content !== undefined && content !== null) {
    const inputContent =
      typeof content === "string"
        ? ([{ type: "text", text: content }] as ChatCompletionsContentPartText[])
        : content;
    for (const part of inputContent) {
      if (part.type === "text") {
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
        lastTextPart = textPart;
      }
    }
  }

  // Gemini signs plain text too, and that signature travels out on the message's
  // extra_content. The provider only reads options off content parts, so put it back on
  // the text that carried it.
  const { thoughtSignature } = extractReasoningMetadata(extra_content ?? undefined);
  if (thoughtSignature && lastTextPart) {
    lastTextPart.providerOptions = {
      ...lastTextPart.providerOptions,
      unknown: { ...(lastTextPart.providerOptions?.["unknown"] as JSONObject), thoughtSignature },
    };
  }

  if (tool_calls?.length) {
    for (const tc of tool_calls) {
      // oxlint-disable-next-line no-shadow
      const { id, function: fn, extra_content } = tc;
      const out: ToolCallPart = {
        type: "tool-call",
        toolCallId: id,
        toolName: fn.name,
        input: parseJsonOrText(fn.arguments).value,
      };
      // The provider-specific extra_content wins; otherwise fall back to the thought
      // signature from reasoning_details. `unknown` is merged into the provider's
      // namespace by the params middleware, so it reaches Vertex as `thoughtSignature`.
      const signature = thoughtSignatures.get(id);
      if (extra_content) {
        out.providerOptions = extra_content;
      } else if (signature) {
        out.providerOptions = { unknown: { thoughtSignature: signature } };
      }
      parts.push(out);
    }
  }

  const out: AssistantModelMessage = {
    role,
    content: parts.length > 0 ? parts : (content ?? ""),
  };

  if (extra_content) {
    out.providerOptions = extra_content;
  }

  if (cache_control) {
    (out.providerOptions ??= {})["unknown"] = { cache_control };
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
      output: parseToolResult(toolMsg.content),
    });
  }

  return toolResultParts.length > 0 ? { role: "tool", content: toolResultParts } : undefined;
}

export function fromChatCompletionsContent(content: ChatCompletionsContentPart[]): UserContent {
  return content.map((part) => {
    switch (part.type) {
      case "image_url":
        return fromImageUrlPart(part.image_url.url, part.cache_control ?? undefined);
      case "file":
        return fromFilePart(
          part.file.data,
          part.file.media_type,
          part.file.filename ?? undefined,
          part.cache_control ?? undefined,
        );
      case "input_audio":
        return fromFilePart(
          part.input_audio.data,
          `audio/${part.input_audio.format}`,
          undefined,
          part.cache_control ?? undefined,
        );
      case "text": {
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
        throw new GatewayError(
          `Unsupported content part type: ${(part as { type: string }).type}`,
          400,
        );
    }
  });
}

function fromImageUrlPart(url: string, cacheControl?: ChatCompletionsCacheControl) {
  const { image, mediaType } = parseImageInput(url);

  if (image instanceof URL) {
    // Media type is unknown for remote URLs; fall back to the top-level type.
    const out: FilePart = {
      type: "file" as const,
      data: image,
      mediaType: mediaType ?? "image",
    };
    if (cacheControl) {
      out.providerOptions = {
        unknown: { cache_control: cacheControl },
      };
    }
    return out;
  }

  return fromFilePart(image, mediaType ?? "image/jpeg", undefined, cacheControl);
}

function fromFilePart(
  base64Data: string,
  mediaType: string,
  filename?: string,
  cacheControl?: ChatCompletionsCacheControl,
) {
  const out: FilePart = {
    type: "file" as const,
    data: parseBase64(base64Data),
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

export const convertToToolSet = (tools: ChatCompletionsTool[] | undefined): ToolSet | undefined => {
  if (!tools) {
    return undefined;
  }

  const toolSet: ToolSet = {};
  for (const t of tools) {
    // Hosted/built-in tools (e.g. web_search) are accepted at the edge but
    // not executed by the gateway; drop anything that isn't a function tool.
    // FUTURE: log dropped hosted tools at warn level (once per request, batched)
    if (t.type !== "function") continue;
    const fn = t as ChatCompletionsFunctionTool;
    toolSet[fn.function.name] = tool({
      description: fn.function.description,
      inputSchema: jsonSchema(fn.function.parameters),
      strict: fn.function.strict,
    });
  }
  return Object.keys(toolSet).length > 0 ? toolSet : undefined;
};

export const convertToToolChoiceOptions = (
  toolChoice: ChatCompletionsToolChoice | undefined,
): ToolChoiceOptions => {
  if (!toolChoice) {
    return {};
  }

  if (toolChoice === "none" || toolChoice === "auto" || toolChoice === "required") {
    return { toolChoice };
  }

  // FUTURE: this is right now google specific, which is not supported by AI SDK, until then,
  // we temporarily map it to auto for now
  // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/migrate/openai/overview
  if (toolChoice === "validated") {
    return { toolChoice: "auto" };
  }

  if (toolChoice.type === "allowed_tools") {
    return {
      toolChoice: toolChoice.allowed_tools.mode,
      activeTools: toolChoice.allowed_tools.tools.map((toolRef) => toolRef.function.name),
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
  content: string | ChatCompletionsContentPartText[],
): ToolResultPart["output"] {
  if (Array.isArray(content)) {
    return {
      type: "content",
      value: content.map((part) => ({
        type: "text",
        text: part.text,
      })),
    };
  }
  return parseJsonOrText(content);
}

// --- Response Flow ---

export function toChatCompletions(
  result: GenerateTextResult<ToolSet, RuntimeContext, Output.Output>,
  model: string,
): ChatCompletions {
  return {
    id: "chatcmpl-" + crypto.randomUUID(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: toChatCompletionsAssistantMessage(result),
        finish_reason: toChatCompletionsFinishReason(result.finishReason),
      } satisfies ChatCompletionsChoice,
    ],
    usage: result.usage ? toChatCompletionsUsage(result.usage) : null,
    provider_metadata: result.finalStep.providerMetadata,
    service_tier: resolveResponseServiceTier(result.finalStep.providerMetadata),
  };
}

export function toChatCompletionsResponse(
  result: GenerateTextResult<ToolSet, RuntimeContext, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toChatCompletions(result, model), responseInit);
}

export function toChatCompletionsStream(
  result: StreamTextResult<ToolSet, RuntimeContext, Output.Output>,
  model: string,
): ChatCompletionsStream {
  return result.stream.pipeThrough(new ChatCompletionsTransformStream(model));
}

export function toChatCompletionsStreamResponse(
  result: StreamTextResult<ToolSet, RuntimeContext, Output.Output>,
  model: string,
  responseInit?: ResponseInit,
): Response {
  return toResponse(toChatCompletionsStream(result, model), responseInit);
}

export class ChatCompletionsTransformStream extends TransformStream<
  TextStreamPart<ToolSet>,
  SseFrame<ChatCompletionsChunk> | SseErrorFrame
> {
  constructor(model: string) {
    const streamId = `chatcmpl-${crypto.randomUUID()}`;
    const creationTime = Math.floor(Date.now() / 1000);
    let toolCallIndexCounter = 0;
    const reasoningIdToIndex = new Map<string, number>();
    const encryptedIds = new Set<string>();
    let finishProviderMetadata: SharedV4ProviderMetadata | undefined;

    /** Reasoning entries share one index space, allocated in order of first appearance. */
    const reasoningIndex = (key: string): number => {
      let index = reasoningIdToIndex.get(key);
      if (index === undefined) {
        index = reasoningIdToIndex.size;
        reasoningIdToIndex.set(key, index);
      }
      return index;
    };

    const createChunk = (
      delta: ChatCompletionsAssistantMessageDelta,
      provider_metadata?: SharedV4ProviderMetadata,
      finish_reason?: ChatCompletionsFinishReason,
      usage?: ChatCompletionsUsage,
    ): SseFrame<ChatCompletionsChunk> => {
      if (provider_metadata) {
        delta.extra_content = provider_metadata;
      }

      return {
        data: {
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
          service_tier: resolveResponseServiceTier(provider_metadata),
        } satisfies ChatCompletionsChunk,
      };
    };

    super({
      transform(part, controller) {
        // Omit lifecycle (start/end) and intermediate events; /chat/completions
        // is a stateless stream of deltas. Tool calls are emitted once fully-formed.
        // oxlint-disable-next-line switch-exhaustiveness-check
        switch (part.type) {
          case "text-delta": {
            controller.enqueue(
              createChunk({ role: "assistant", content: part.text }, part.providerMetadata),
            );
            break;
          }

          case "reasoning-delta": {
            controller.enqueue(
              createChunk(
                {
                  reasoning: part.text,
                  reasoning_details: [
                    toReasoningDetail(
                      {
                        type: "reasoning",
                        text: part.text,
                        providerMetadata: part.providerMetadata,
                      },
                      part.id,
                      reasoningIndex(part.id),
                    ),
                  ],
                },
                part.providerMetadata,
              ),
            );
            break;
          }

          case "reasoning-end": {
            // OpenAI only reveals its encrypted trace when the item closes, so it never
            // rides along on a delta — and repeats it for every summary part of the item.
            const { encryptedContent, itemId, format } = extractReasoningMetadata(
              part.providerMetadata,
            );
            const id = itemId ?? part.id;
            if (!encryptedContent || encryptedIds.has(id)) break;
            encryptedIds.add(id);

            controller.enqueue(
              createChunk({
                reasoning_details: [
                  {
                    id,
                    // Keyed apart from the text deltas of the same block so the encrypted
                    // entry gets an index of its own.
                    index: reasoningIndex(`${id}:encrypted`),
                    type: "reasoning.encrypted",
                    data: encryptedContent,
                    format,
                  },
                ],
              }),
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

            // Mirror the tool call's Gemini thought signature into reasoning_details.
            const delta: ChatCompletionsAssistantMessageDelta = { tool_calls: [toolCall] };
            const detail = toThoughtSignatureDetail(
              part.toolCallId,
              part.providerMetadata,
              reasoningIdToIndex.size,
            );
            if (detail) {
              reasoningIdToIndex.set(`${part.toolCallId}:signature`, detail.index);
              delta.reasoning_details = [detail];
            }

            controller.enqueue(createChunk(delta));
            break;
          }

          case "finish-step": {
            finishProviderMetadata = part.providerMetadata;
            break;
          }

          case "finish": {
            controller.enqueue(
              createChunk(
                {},
                finishProviderMetadata,
                toChatCompletionsFinishReason(part.finishReason),
                toChatCompletionsUsage(part.totalUsage),
              ),
            );
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

export const toChatCompletionsAssistantMessage = (
  result: GenerateTextResult<ToolSet, RuntimeContext, Output.Output>,
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
  const encryptedIds = new Set<string>();

  for (const part of result.content) {
    if (part.type === "text") {
      if (message.content === null) {
        message.content = part.text;
      } else {
        (message.content as string) += part.text;
      }
      if (part.providerMetadata) {
        message.extra_content = part.providerMetadata;
      }
    } else if (part.type === "reasoning") {
      const metadata = extractReasoningMetadata(part.providerMetadata);
      const id = metadata.itemId ?? `reasoning-${crypto.randomUUID()}`;
      reasoningDetails.push(toReasoningDetail(part, id, reasoningDetails.length, metadata));

      // OpenAI hands its encrypted trace over *alongside* the summary text rather than
      // in place of it, repeating it on every summary part of the same item.
      if (metadata.encryptedContent && !encryptedIds.has(id)) {
        encryptedIds.add(id);
        reasoningDetails.push({
          id,
          index: reasoningDetails.length,
          type: "reasoning.encrypted",
          data: metadata.encryptedContent,
          format: metadata.format,
        });
      }
    }
  }

  // Appended after the reasoning entries so `index` stays in generation order.
  for (const toolCall of result.toolCalls ?? []) {
    const detail = toThoughtSignatureDetail(
      toolCall.toolCallId,
      toolCall.providerMetadata,
      reasoningDetails.length,
    );
    if (detail) reasoningDetails.push(detail);
  }

  if (result.finalStep.reasoningText) {
    message.reasoning = result.finalStep.reasoningText;
  }

  if (reasoningDetails.length > 0) {
    message.reasoning_details = reasoningDetails;
  }

  if (!message.content && !message.tool_calls) {
    // some models return just reasoning without tool calls or content
    message.content = "";
  }

  return message;
};

export function toReasoningDetail(
  reasoning: ReasoningOutput,
  id: string,
  index: number,
  metadata: ReasoningMetadata = extractReasoningMetadata(reasoning.providerMetadata),
): ChatCompletionsReasoningDetail {
  const { redactedData, signature, thoughtSignature, itemId, format } = metadata;
  // OpenAI's reasoning item id is the correlation key clients must echo back, so it
  // wins over the synthetic one.
  const detailId = itemId ?? id;

  // Anthropic sends redacted thinking *instead of* the text.
  if (redactedData) {
    return { id: detailId, index, type: "reasoning.encrypted", data: redactedData, format };
  }

  return {
    id: detailId,
    index,
    type: "reasoning.text",
    text: reasoning.text,
    // Gemini calls its signature a thought signature; it plays the same role here.
    signature: signature ?? thoughtSignature,
    format,
  };
}

/**
 * Gemini hangs its thought signature off the tool call rather than off a reasoning
 * block. Mirror it into a `reasoning_details` entry so OpenAI-compatible clients
 * round-trip it: both OpenRouter and the Vercel AI Gateway use `reasoning.encrypted`
 * with the blob in `data`, and OpenRouter sets `id` to the tool call it belongs to so it
 * can be reattached to the right call on the next turn.
 */
export function toThoughtSignatureDetail(
  toolCallId: string,
  providerMetadata: SharedV4ProviderMetadata | undefined,
  index: number,
): ChatCompletionsReasoningDetail | undefined {
  const { thoughtSignature } = extractReasoningMetadata(providerMetadata);
  if (!thoughtSignature) return undefined;

  return {
    id: toolCallId,
    index,
    type: "reasoning.encrypted",
    data: thoughtSignature,
    format: GEMINI_REASONING_FORMAT,
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
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens;
  if (cached !== undefined || cacheWrite !== undefined) {
    out.prompt_tokens_details = {};
    if (cached !== undefined) {
      out.prompt_tokens_details.cached_tokens = cached;
    }
    if (cacheWrite !== undefined) {
      out.prompt_tokens_details.cache_write_tokens = cacheWrite;
    }
  }

  return out;
}

export function toChatCompletionsToolCall(
  id: string,
  name: string,
  args: unknown,
  providerMetadata?: SharedV4ProviderMetadata,
): ChatCompletionsToolCall {
  const out: ChatCompletionsToolCall = {
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

export const toChatCompletionsFinishReason = (
  finishReason: FinishReason,
): ChatCompletionsFinishReason => {
  if (finishReason === "error" || finishReason === "other") {
    return "stop";
  }
  return (finishReason as string).replaceAll("-", "_") as ChatCompletionsFinishReason;
};
