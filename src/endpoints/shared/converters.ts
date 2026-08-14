import type {
  JSONObject,
  SharedV4ProviderMetadata,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import {
  type JSONValue,
  type ToolSet,
  type ModelMessage,
  type ToolChoice,
  type Output,
  type StopCondition,
} from "ai";
import { z } from "zod";

import { GatewayError } from "../../errors/gateway";
import { parseDataUrl } from "../../utils/url";
import type { ReasoningConfig, ReasoningEffort, CacheControl, ServiceTier } from "./schema";

/**
 * Runtime context type parameter for the AI SDK result types.
 * The gateway does not use runtime context, and `ai` does not re-export its
 * own `Context` alias, so mirror it here.
 */
export type RuntimeContext = Record<string, unknown>;

export type ToolChoiceOptions = {
  toolChoice?: ToolChoice<ToolSet>;
  activeTools?: string[];
};

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
  seed?: number;
  topP?: number;
  stopSequences?: string[];
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  providerOptions: SharedV4ProviderOptions;
};

export function parseJsonOrText(
  content: string,
): { type: "json"; value: JSONValue } | { type: "text"; value: string } {
  try {
    return { type: "json", value: JSON.parse(content) as JSONValue };
  } catch {
    return { type: "text", value: content };
  }
}

export function parseBase64(base64: string): Uint8Array {
  try {
    return z.util.base64ToUint8Array(base64);
  } catch (error) {
    throw new GatewayError("Invalid base64 data", 400, undefined, error);
  }
}

/**
 * Parses arbitrary file input, which OpenAI clients send either as a data URL
 * (`data:application/pdf;base64,...`) or as bare base64. Returns the base64
 * payload plus the declared media type when the data URL carried one.
 */
export function parseFileInput(data: string): { data: string; mediaType?: string } {
  if (data.startsWith("data:")) {
    const { mimeType, dataStart } = parseDataUrl(data);
    if (!mimeType || dataStart <= 5 || dataStart >= data.length) {
      throw new GatewayError("Invalid data URL", 400);
    }
    return { data: data.slice(dataStart), mediaType: mimeType };
  }

  return { data };
}

export function parseImageInput(url: string): { image: string | URL; mediaType?: string } {
  const dataPrefix = "data:";
  if (url.startsWith(dataPrefix)) {
    const { mimeType, dataStart } = parseDataUrl(url);
    if (!mimeType || dataStart <= dataPrefix.length || dataStart >= url.length) {
      throw new GatewayError("Invalid data URL", 400);
    }
    if (!mimeType.startsWith("image/")) {
      throw new GatewayError(
        `Unsupported image media type: ${mimeType}. Use the 'file' content part type for non-image media.`,
        400,
      );
    }
    return {
      image: url.slice(dataStart),
      mediaType: mimeType,
    };
  }

  try {
    return { image: new URL(url) };
  } catch (error) {
    throw new GatewayError("Invalid image URL", 400, undefined, error);
  }
}

export function parseReasoningOptions(
  reasoning_effort?: ReasoningEffort | null,
  reasoning?: ReasoningConfig | null,
) {
  const effort = reasoning?.effort ?? reasoning_effort;
  const max_tokens = reasoning?.max_tokens;

  if (reasoning?.enabled === false || effort === "none") {
    return { reasoning: { enabled: false, effort: "none" }, reasoning_effort: "none" };
  }
  if (!reasoning && (effort === undefined || effort === null)) return {};

  const out: {
    reasoning: ReasoningConfig;
    reasoning_effort?: ReasoningEffort;
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

export function parsePromptCachingOptions(
  prompt_cache_key?: string,
  prompt_cache_retention?: "in-memory" | "24h",
  cache_control?: CacheControl,
) {
  const out: Record<string, unknown> = {};

  let retention = prompt_cache_retention;
  if (!retention && cache_control?.ttl) {
    retention = cache_control.ttl === "24h" ? "24h" : "in-memory";
  }

  let control = cache_control;
  if (!control && retention) {
    control = {
      type: "ephemeral",
      ttl: retention === "24h" ? "24h" : "5m",
    };
  }

  if (prompt_cache_key) out["prompt_cache_key"] = prompt_cache_key;
  if (retention) out["prompt_cache_retention"] = retention;
  if (control) out["cache_control"] = control;

  return out;
}

export function resolveResponseServiceTier(
  providerMetadata?: SharedV4ProviderMetadata,
): ServiceTier | undefined {
  if (!providerMetadata) return undefined;

  for (const metadata of Object.values(providerMetadata)) {
    const tier = parseReturnedServiceTier(
      metadata["service_tier"] ??
        (metadata["usage_metadata"] as JSONObject | undefined)?.["traffic_type"],
    );
    if (tier) return tier;
  }

  return undefined;
}

function parseReturnedServiceTier(value: unknown): ServiceTier | undefined {
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

export function normalizeToolName(name: string): string {
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

export function stripEmptyKeys(obj: unknown) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if ("" in obj) {
    (obj as Record<string, unknown>)[""] = undefined;
  }
  return obj;
}

/**
 * `reasoning_details[].format` tags, as enumerated by OpenRouter. Clients use them to
 * tell which convention an opaque reasoning blob follows, so they can decide whether
 * it is safe to replay. https://openrouter.ai/docs/use-cases/reasoning-tokens
 */
export type ReasoningFormat =
  | "unknown"
  | "openai-responses-v1"
  | "azure-openai-responses-v1"
  | "bedrock-openai-responses-v1"
  | "xai-responses-v1"
  | "meta-responses-v1"
  | "anthropic-claude-v1"
  | "google-gemini-v1";

export const GEMINI_REASONING_FORMAT = "google-gemini-v1";

/**
 * Maps an AI SDK provider metadata namespace to the format tag for that provider's
 * reasoning blobs. The params middleware snakizes metadata *values* but never renames
 * namespaces, so these are the namespaces the providers themselves emit.
 */
const REASONING_FORMATS: Record<string, ReasoningFormat> = {
  anthropic: "anthropic-claude-v1",
  // Claude on Bedrock. GPT on Bedrock runs through the Mantle endpoint, which reports
  // itself under `openai`.
  bedrock: "anthropic-claude-v1",
  amazonBedrock: "anthropic-claude-v1",
  google: GEMINI_REASONING_FORMAT,
  googleVertex: GEMINI_REASONING_FORMAT,
  vertex: GEMINI_REASONING_FORMAT,
  openai: "openai-responses-v1",
  azure: "azure-openai-responses-v1",
  xai: "xai-responses-v1",
};

export function toReasoningFormat(namespace: string): ReasoningFormat {
  return REASONING_FORMATS[namespace] ?? "unknown";
}

/**
 * OpenAI-style encrypted reasoning, whichever host serves it. These are the formats
 * whose `id` is an OpenAI reasoning item id and can be replayed as one.
 */
export function isOpenAIReasoningFormat(format?: string | null): boolean {
  return (
    format === "openai-responses-v1" ||
    format === "azure-openai-responses-v1" ||
    format === "bedrock-openai-responses-v1"
  );
}

export type ReasoningMetadata = {
  /** Anthropic thinking signature. */
  signature?: string;
  /** Anthropic redacted thinking payload. */
  redactedData?: string;
  /** OpenAI encrypted reasoning trace. */
  encryptedContent?: string;
  /** OpenAI reasoning item id the trace belongs to. */
  itemId?: string;
  /** Gemini thought signature. */
  thoughtSignature?: string;
  /** Format tag for the namespace the fields were found in. */
  format: ReasoningFormat;
};

function readMetadataString(
  metadata: JSONObject,
  camelKey: string,
  snakeKey: string,
): string | undefined {
  // Responses come back snakized by the params middleware; raw AI SDK output is camel.
  const value = metadata[camelKey] ?? metadata[snakeKey];
  return typeof value === "string" ? value : undefined;
}

/**
 * Pulls every opaque reasoning artifact the supported providers attach to a reasoning
 * or tool-call part, along with the format tag implied by its namespace. Namespaces are
 * scanned rather than named so new hosts of the same model work without a code change.
 */
export function extractReasoningMetadata(
  providerMetadata?: SharedV4ProviderMetadata,
): ReasoningMetadata {
  const out: ReasoningMetadata = { format: "unknown" };
  if (!providerMetadata) return out;

  for (const namespace in providerMetadata) {
    const metadata = providerMetadata[namespace];
    if (!metadata || typeof metadata !== "object") continue;

    if (out.format === "unknown") out.format = toReasoningFormat(namespace);

    const signature = readMetadataString(metadata, "signature", "signature");
    const redactedData = readMetadataString(metadata, "redactedData", "redacted_data");
    const encryptedContent = readMetadataString(
      metadata,
      "reasoningEncryptedContent",
      "reasoning_encrypted_content",
    );
    const itemId = readMetadataString(metadata, "itemId", "item_id");
    const thoughtSignature = readMetadataString(metadata, "thoughtSignature", "thought_signature");

    if (signature || redactedData || encryptedContent || itemId || thoughtSignature) {
      out.signature = signature;
      out.redactedData = redactedData;
      out.encryptedContent = encryptedContent;
      out.itemId = itemId;
      out.thoughtSignature = thoughtSignature;
      return out;
    }
  }

  return out;
}
