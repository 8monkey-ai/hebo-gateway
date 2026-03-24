import type { JSONObject, SharedV3ProviderMetadata, SharedV3ProviderOptions } from "@ai-sdk/provider";
import {
  tool,
  jsonSchema,
  type JSONValue,
  type LanguageModelUsage,
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
  providerOptions: SharedV3ProviderOptions;
};

export function parseJsonOrText(
  content: string,
): { type: "json"; value: JSONValue } | { type: "text"; value: string } {
  try {
    // oxlint-disable-next-line no-unsafe-assignment
    return { type: "json", value: JSON.parse(content) };
  } catch {
    return { type: "text", value: content };
  }
}

export function parseBase64(base64: string, errorMsg: string): Uint8Array {
  try {
    return z.util.base64ToUint8Array(base64);
  } catch {
    throw new GatewayError(errorMsg, 400);
  }
}

export function parseImageInput(
  url: string,
  errorPrefix = "Invalid image URL",
): { image: Uint8Array | URL; mediaType?: string } {
  if (url.startsWith("data:")) {
    const { mimeType, dataStart } = parseDataUrl(url);
    if (!mimeType || dataStart <= "data:".length || dataStart >= url.length) {
      throw new GatewayError("Invalid data URL", 400);
    }
    return {
      image: parseBase64(url.slice(dataStart), "Invalid base64 data in image URL"),
      mediaType: mimeType,
    };
  }

  try {
    return { image: new URL(url) };
  } catch {
    throw new GatewayError(`${errorPrefix}: ${url}`, 400);
  }
}

export function mapLanguageModelUsage(usage: LanguageModelUsage) {
  const prompt = usage.inputTokens ?? 0;
  const completion = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? prompt + completion;

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    cached_tokens: usage.inputTokenDetails?.cacheReadTokens,
    cache_write_tokens: usage.inputTokenDetails?.cacheWriteTokens,
    reasoning_tokens: usage.outputTokenDetails?.reasoningTokens,
  };
}

export function parseReasoningOptions(
  reasoning_effort: ReasoningEffort | undefined,
  reasoning: ReasoningConfig | undefined,
) {
  const effort = reasoning?.effort ?? reasoning_effort;
  const max_tokens = reasoning?.max_tokens;

  if (reasoning?.enabled === false || effort === "none") {
    return { reasoning: { enabled: false }, reasoning_effort: "none" };
  }
  if (!reasoning && effort === undefined) return {};

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
  prompt_cache_key: string | undefined,
  prompt_cache_retention: "in_memory" | "24h" | undefined,
  cache_control: CacheControl | undefined,
) {
  const out: Record<string, unknown> = {};

  let retention = prompt_cache_retention;
  if (!retention && cache_control?.ttl) {
    retention = cache_control.ttl === "24h" ? "24h" : "in_memory";
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
  providerMetadata: SharedV3ProviderMetadata | undefined,
): ServiceTier | undefined {
  if (!providerMetadata) return;

  for (const metadata of Object.values(providerMetadata)) {
    const tier = parseReturnedServiceTier(
      metadata["service_tier"] ??
        (metadata["usage_metadata"] as JSONObject | undefined)?.["traffic_type"],
    );
    if (tier) return tier;
  }
}

export function parseReturnedServiceTier(value: unknown): ServiceTier | undefined {
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
  delete (obj as Record<string, unknown>)[""];
  return obj;
}

export function extractReasoningMetadata(
  providerMetadata: SharedV3ProviderMetadata | undefined,
): { redactedData?: string; signature?: string } {
  if (!providerMetadata) return {};

  for (const metadata of Object.values(providerMetadata)) {
    if (metadata && typeof metadata === "object") {
      let redactedData: string | undefined;
      let signature: string | undefined;
      let found = false;

      if ("redactedData" in metadata && typeof metadata["redactedData"] === "string") {
        redactedData = metadata["redactedData"];
        found = true;
      }
      if ("signature" in metadata && typeof metadata["signature"] === "string") {
        signature = metadata["signature"];
        found = true;
      }

      if (found) {
        return { redactedData, signature };
      }
    }
  }

  return {};
}

export function toToolSet<T>(
  tools: T[] | undefined,
  map: (t: T) => { name: string; description?: string; parameters: any; strict?: boolean },
): ToolSet | undefined {
  if (!tools) return;

  const toolSet: ToolSet = {};
  for (const t of tools) {
    const { name, description, parameters, strict } = map(t);
    toolSet[name] = tool({
      description,
      inputSchema: jsonSchema(parameters),
      strict,
    });
  }
  return toolSet;
}
