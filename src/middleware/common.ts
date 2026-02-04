import type { JSONObject } from "@ai-sdk/provider";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ProviderId } from "../providers/types";

function snakeToCamel(key: string): string {
  return key.replaceAll(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnake(key: string): string {
  return key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camelizeKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => camelizeKeysDeep(v));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    out[snakeToCamel(k)] = camelizeKeysDeep(v);
  }
  return out;
}

function snakizeKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => snakizeKeysDeep(v));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    out[camelToSnake(k)] = snakizeKeysDeep(v);
  }
  return out;
}

/**
 * Converts snake_case params in providerOptions to camelCase
 * and moves all of them into providerOptions[providerName].
 * Also snakizes providerMetadata in the output for OpenAI compatibility.
 */
type Kind = "embedding" | "language";
type MiddlewareFor<K extends Kind> = K extends "embedding"
  ? EmbeddingModelMiddleware
  : LanguageModelMiddleware;
type TransformOptsFor<K extends Kind> = Parameters<
  NonNullable<MiddlewareFor<K>["transformParams"]>
>[0];

function forwardParamsForMiddleware<K extends Kind>(
  kind: K,
  providerName: ProviderId,
): MiddlewareFor<K> {
  const processOptions = (providerOptions: Record<string, JSONObject> | undefined) => {
    if (!providerOptions) return;

    if (providerOptions[providerName]) {
      providerOptions[providerName] = camelizeKeysDeep(providerOptions[providerName]) as Record<
        string,
        JSONObject
      >;
    }

    const target = (providerOptions[providerName] ??= {});
    for (const key in providerOptions) {
      if (key === providerName) continue;
      Object.assign(target, camelizeKeysDeep(providerOptions[key]) as Record<string, JSONObject>);
      if (key === "unknown") delete providerOptions[key];
    }
  };

  const processMetadata = (providerMetadata: Record<string, JSONObject> | undefined) => {
    if (!providerMetadata) return;

    if (providerMetadata[providerName]) {
      providerMetadata[providerName] = snakizeKeysDeep(
        providerMetadata[providerName],
      ) as JSONObject;
    }

    const target = (providerMetadata[providerName] ??= {});
    const keys = Object.keys(providerMetadata);
    for (const key of keys) {
      if (key === providerName) continue;
      Object.assign(target, snakizeKeysDeep(providerMetadata[key]));
      delete providerMetadata[key];
    }
  };

  return {
    specificationVersion: "v3" as const,
    // eslint-disable-next-line require-await
    transformParams: async (options: TransformOptsFor<K>) => {
      const { params } = options;

      processOptions(params.providerOptions);

      if (kind === "language") {
        for (const message of params.prompt) {
          if (message.providerOptions) {
            processOptions(message.providerOptions);
          }
          if (message.content) {
            for (const part of message.content) {
              processOptions(part.providerOptions);
            }
          }
        }
      }

      return params;
    },
    wrapGenerate: async ({ doGenerate }: any) => {
      const result = await doGenerate();

      processMetadata(result.providerMetadata);

      if (result.content) {
        for (const part of result.content) {
          processMetadata(part.providerMetadata);
        }
      }

      return result;
    },
    wrapStream: async ({ doStream }: any) => {
      const result = await doStream();

      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              processMetadata(part.providerMetadata);
              controller.enqueue(part);
            },
          }),
        ),
      };
    },
    wrapEmbed: async ({ doEmbed }: any) => {
      const result = await doEmbed();

      processMetadata(result.providerMetadata);

      return result;
    },
  } as MiddlewareFor<K>;
}

export function extractProviderNamespace(id: string): string {
  if (id.includes("vertex")) return "vertex";

  const lastDot = id.lastIndexOf(".");
  const tail = lastDot === -1 ? id : id.slice(lastDot + 1);

  const lastDash = tail.lastIndexOf("-");
  return lastDash === -1 ? tail : tail.slice(lastDash + 1);
}

export function forwardParamsMiddleware(provider: string): LanguageModelMiddleware {
  return forwardParamsForMiddleware("language", extractProviderNamespace(provider));
}

export function forwardParamsEmbeddingMiddleware(provider: string): EmbeddingModelMiddleware {
  return forwardParamsForMiddleware("embedding", extractProviderNamespace(provider));
}
