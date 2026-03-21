import type { JSONObject, SharedV3ProviderMetadata } from "@ai-sdk/provider";
import type { JSONValue } from "ai";

import type { ReasoningConfig, ReasoningEffort, CacheControl, ServiceTier } from "./schema";

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
