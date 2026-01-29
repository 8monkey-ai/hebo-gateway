import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ModelId } from "../models/types";
import type { ProviderId } from "../providers/types";

type MiddlewareEntry = {
  language?: LanguageModelMiddleware | LanguageModelMiddleware[];
  embedding?: EmbeddingModelMiddleware | EmbeddingModelMiddleware[];
};

type Stored = {
  language: LanguageModelMiddleware[];
  embedding: EmbeddingModelMiddleware[];
};

type MatchKind = "exact" | "startsWith" | "endsWith" | "includes";

type Rule = {
  kind: MatchKind;
  value: string;
  stored: Stored;
};

class SimpleMatcher {
  private rules: Rule[] = [];

  private cache = new Map<string, Stored[]>();
  private static readonly MAX_CACHE = 500;

  use(pattern: string, entry: MiddlewareEntry) {
    this.cache.clear();
    const kind = getKind(pattern);
    const value = pattern.replaceAll("*", "");

    const stored: Stored = { language: [], embedding: [] };
    if (entry.language) stored.language.push(...toArray(entry.language));
    if (entry.embedding) stored.embedding.push(...toArray(entry.embedding));

    this.rules.push({ kind, value, stored });
  }

  match(key: string): Stored[] {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const out: Stored[] = [];
    for (const r of this.rules) if (matches(key, r)) out.push(r.stored);

    if (this.cache.size >= SimpleMatcher.MAX_CACHE) {
      let n = Math.ceil(SimpleMatcher.MAX_CACHE * 0.2);
      for (const key of this.cache.keys()) {
        this.cache.delete(key);
        if (--n === 0) break;
      }
    }
    this.cache.set(key, out);

    return out;
  }
}

class ModelMiddlewareMatcher {
  private model = new SimpleMatcher();
  private provider = new SimpleMatcher();

  useForModel(pattern: ModelId | string, entry: MiddlewareEntry) {
    this.model.use(pattern, entry);
  }

  useForProvider(pattern: ProviderId | string, entry: MiddlewareEntry) {
    this.provider.use(pattern, entry);
  }

  forLanguage(modelId: ModelId, providerId: ProviderId): LanguageModelMiddleware[] {
    const out: LanguageModelMiddleware[] = [];
    for (const s of this.model.match(modelId)) out.push(...s.language);
    for (const s of this.provider.match(providerId)) out.push(...s.language);
    return out;
  }

  forEmbedding(modelId: ModelId, providerId: ProviderId): EmbeddingModelMiddleware[] {
    const out: EmbeddingModelMiddleware[] = [];
    for (const s of this.model.match(modelId)) out.push(...s.embedding);
    for (const s of this.provider.match(providerId)) out.push(...s.embedding);
    return out;
  }
}

export const modelMiddlewareMatcher = new ModelMiddlewareMatcher();
export type { ModelMiddlewareMatcher };

const toArray = <T>(v: T | T[]) => (Array.isArray(v) ? v : [v]);

function getKind(pattern: string) {
  const hasStart = pattern.startsWith("*");
  const hasEnd = pattern.endsWith("*");

  const kind: MatchKind =
    hasStart && hasEnd ? "includes" : hasStart ? "endsWith" : hasEnd ? "startsWith" : "exact";

  return kind;
}

function matches(key: string, r: Rule): boolean {
  switch (r.kind) {
    case "exact":
      return key === r.value;
    case "endsWith":
      return key.endsWith(r.value);
    case "startsWith":
      return key.startsWith(r.value);
    case "includes":
      return key.includes(r.value);
  }
}
