import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ModelId } from "../models/types";
import type { ProviderId } from "../providers/types";

import { logger } from "../utils/logger";

type MiddlewareEntry = {
  language?: LanguageModelMiddleware | LanguageModelMiddleware[];
  embedding?: EmbeddingModelMiddleware | EmbeddingModelMiddleware[];
};

type Stored = {
  language: LanguageModelMiddleware[];
  embedding: EmbeddingModelMiddleware[];
};

type Rule = {
  pattern: string;
  test: (key: string) => boolean;
  stored: Stored;
};

class SimpleMatcher {
  private rules: Rule[] = [];

  private cache = new Map<string, Stored[]>();
  private static readonly MAX_CACHE = 500;

  use(pattern: string, entry: MiddlewareEntry) {
    this.cache.clear();

    const stored: Stored = { language: [], embedding: [] };
    if (entry.language) stored.language.push(...toArray(entry.language));
    if (entry.embedding) stored.embedding.push(...toArray(entry.embedding));

    this.rules.push({ pattern, test: compilePattern(pattern), stored });
  }

  match(key: string): Stored[] {
    const cached = this.cache.get(key);
    if (cached) {
      logger.debug(`[middleware] cache hit: ${key} (${cached.length})`);
      return cached;
    }

    const out: Stored[] = [];
    const matched: string[] = [];
    for (const r of this.rules) {
      if (!r.test(key)) continue;
      out.push(r.stored);
      matched.push(r.pattern);
    }

    if (this.cache.size >= SimpleMatcher.MAX_CACHE) {
      let n = Math.ceil(SimpleMatcher.MAX_CACHE * 0.2);
      logger.info(`[middleware] cache evictions: ${n} entries`);
      for (const key of this.cache.keys()) {
        this.cache.delete(key);
        if (--n === 0) break;
      }
    }

    this.cache.set(key, out);
    const matchedSummary = matched.length > 0 ? matched.join(",") : "none";
    logger.debug(`[middleware] rules matched: ${key} (${out.length}) [${matchedSummary}]`);
    return out;
  }
}

class ModelMiddlewareMatcher {
  private model = new SimpleMatcher();
  private provider = new SimpleMatcher();

  useForModel(patterns: ModelId | readonly ModelId[], entry: MiddlewareEntry) {
    for (const pattern of toArray(patterns)) {
      this.model.use(pattern, entry);
    }
  }

  useForProvider(patterns: ProviderId | readonly ProviderId[], entry: MiddlewareEntry) {
    for (const pattern of toArray(patterns)) {
      this.provider.use(pattern, entry);
    }
  }

  forModel(modelId: ModelId): LanguageModelMiddleware[] {
    const out: LanguageModelMiddleware[] = [];
    for (const s of this.model.match(modelId)) out.push(...s.language);
    return out;
  }

  forProvider(providerId: ProviderId): LanguageModelMiddleware[] {
    const out: LanguageModelMiddleware[] = [];
    for (const s of this.provider.match(providerId)) out.push(...s.language);
    return out;
  }

  forEmbeddingModel(modelId: ModelId): EmbeddingModelMiddleware[] {
    const out: EmbeddingModelMiddleware[] = [];
    for (const s of this.model.match(modelId)) out.push(...s.embedding);
    return out;
  }

  forEmbeddingProvider(providerId: ProviderId): EmbeddingModelMiddleware[] {
    const out: EmbeddingModelMiddleware[] = [];
    for (const s of this.provider.match(providerId)) out.push(...s.embedding);
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
