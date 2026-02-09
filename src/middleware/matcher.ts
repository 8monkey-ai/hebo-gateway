import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ModelId } from "../models/types";
import type { ProviderId } from "../providers/types";

import { logger } from "../logger";
import { forwardParamsEmbeddingMiddleware, forwardParamsMiddleware } from "./common";

type MiddlewareEntries = {
  language?: LanguageModelMiddleware[];
  embedding?: EmbeddingModelMiddleware[];
};

type Rule = {
  pattern: string;
  test: (key: string) => boolean;
  stored: MiddlewareEntries;
};

type ModelMiddleware = LanguageModelMiddleware | EmbeddingModelMiddleware;

class SimpleMatcher {
  private rules: Rule[] = [];

  use(pattern: string, entry: MiddlewareEntries) {
    const stored: MiddlewareEntries = {
      language: entry.language ? [...entry.language] : undefined,
      embedding: entry.embedding ? [...entry.embedding] : undefined,
    };

    this.rules.push({ pattern, test: compilePattern(pattern), stored });
  }

  match(key: string): MiddlewareEntries[] {
    const out: MiddlewareEntries[] = [];
    const matched: string[] = [];
    for (const r of this.rules) {
      if (!r.test(key)) continue;
      out.push(r.stored);
      matched.push(r.pattern);
    }
    const matchedSummary = matched.length > 0 ? matched.join(",") : "none";
    logger.debug(`[middleware] matched ${key} to [${matchedSummary}]`);
    return out;
  }
}

class ModelMiddlewareMatcher {
  private model = new SimpleMatcher();
  private provider = new SimpleMatcher();

  private static readonly MAX_CACHE = 500;
  private cache = new Map<string, ModelMiddleware[]>();

  useForModel(patterns: ModelId | readonly ModelId[], entry: MiddlewareEntries) {
    this.cache.clear();
    for (const pattern of toArray(patterns)) {
      this.model.use(pattern, entry);
    }
  }

  useForProvider(patterns: ProviderId | readonly ProviderId[], entry: MiddlewareEntries) {
    this.cache.clear();
    for (const pattern of toArray(patterns)) {
      this.provider.use(pattern, entry);
    }
  }

  for(modelId: ModelId, providerId: ProviderId): LanguageModelMiddleware[] {
    return this.resolve({
      kind: "text",
      modelId,
      providerId,
      forward: () => forwardParamsMiddleware(providerId),
    }) as LanguageModelMiddleware[];
  }

  forEmbedding(modelId: ModelId, providerId: ProviderId): EmbeddingModelMiddleware[] {
    return this.resolve({
      kind: "embedding",
      modelId,
      providerId,
      forward: () => forwardParamsEmbeddingMiddleware(providerId),
    }) as EmbeddingModelMiddleware[];
  }

  resolve(options: {
    kind: "text" | "embedding";
    modelId?: ModelId;
    providerId?: ProviderId;
    forward?: ModelMiddleware | (() => ModelMiddleware);
  }): ModelMiddleware[] {
    const { kind, modelId, providerId, forward } = options;

    const key = `${kind}-${modelId}:${providerId}`;
    const cached = this.cache.get(key);
    if (cached) {
      logger.debug(`[middleware] cache hit for ${modelId}:${providerId}`);
      return cached;
    }

    const out: ModelMiddleware[] = [];
    if (modelId) {
      out.push(...this.collect(this.model.match(modelId), kind));
    }
    if (forward) {
      out.push(typeof forward === "function" ? forward() : forward);
    }
    if (providerId) {
      out.push(...this.collect(this.provider.match(providerId), kind));
    }

    if (this.cache.size >= ModelMiddlewareMatcher.MAX_CACHE) {
      let n = Math.ceil(ModelMiddlewareMatcher.MAX_CACHE * 0.2);
      for (const cacheKey of this.cache.keys()) {
        this.cache.delete(cacheKey);
        if (--n === 0) break;
      }
      logger.warn(`[middleware] cache eviction`);
    }

    this.cache.set(key, out);
    return out;
  }

  private collect(entries: MiddlewareEntries[], kind: "text" | "embedding"): ModelMiddleware[] {
    const out: ModelMiddleware[] = [];
    for (const s of entries) {
      if (kind === "text") out.push(...(s.language ?? []));
      else out.push(...(s.embedding ?? []));
    }
    return out;
  }
}

export const modelMiddlewareMatcher = new ModelMiddlewareMatcher();
export type { ModelMiddlewareMatcher };

const toArray = <T>(v: T | readonly T[]) => (Array.isArray(v) ? v : [v]);

function compilePattern(pattern: string): (key: string) => boolean {
  if (!pattern.includes("*")) return (key) => key === pattern;

  const re = new RegExp(
    `^${pattern
      .split("*")
      .map((p) => p.replaceAll(/[-\\^$+?.()|[\]{}]/g, "\\$&"))
      .join(".*")}$`,
  );

  return (key) => re.test(key);
}
