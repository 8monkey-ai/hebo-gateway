import { logger } from "../logger/index.ts";
import { getCanonicalIdsResolver, type CanonicalModelKind } from "../providers/registry.ts";
import type { ProviderRegistry } from "../providers/types.ts";
import { compileGlob } from "../utils/glob.ts";
import { deepMerge, type DeepPartial } from "../utils/merge.ts";
import bundled from "./models-dev.json" with { type: "json" };
import { fromModelsDev, MODELS_DEV_API_URL, type ModelsDevApi } from "./models-dev.ts";
import type { CatalogModel, ModelCatalog, ModelId } from "./types.ts";

/** models.dev snapshot taken at build time, used whenever the live catalog is unavailable. */
export const BUNDLED_MODEL_CATALOG = bundled as ModelCatalog;

export const DEFAULT_CATALOG_TIMEOUT_MS = 5000;

export type ModelCatalogConfig = {
  /**
   * URL of a models.dev `api.json` (or a self-hosted copy) loaded once, on the first request.
   * Falls back to the snapshot bundled with this release when it cannot be loaded.
   * Set to `false` to only use the bundled snapshot.
   * @default "https://models.dev/api.json"
   */
  source?: string | false;
  /**
   * Timeout for loading `source`, in milliseconds.
   * @default 5000
   */
  timeout?: number;
  /**
   * Only expose models matching one of these IDs or `*` patterns
   * (e.g. `["anthropic/claude-*", "openai/gpt-oss-120b"]`).
   * An empty list exposes only the models declared in `overrides`.
   */
  include?: readonly ModelId[];
  /** Hide models matching one of these IDs or `*` patterns. Applied after `include`. */
  exclude?: readonly ModelId[];
  /**
   * Per-model changes, deep-merged into the catalog entry (arrays are replaced). An ID that
   * is not in the catalog, or was filtered out, is added (it then needs `providers`).
   */
  overrides?: { [K in ModelId]?: DeepPartial<CatalogModel> };
};

export type ModelCatalogStore = {
  /** The catalog, once loaded. */
  readonly current: ModelCatalog | undefined;
  /** Loads the catalog once. Never rejects: falls back to the bundled snapshot. */
  load(): Promise<ModelCatalog>;
};

const compileAll = (patterns: readonly string[]) => {
  const tests = patterns.map((pattern) => compileGlob(pattern));
  return (id: string) => tests.some((test) => test(id));
};

const kindOf = (model: CatalogModel): CanonicalModelKind => {
  const output = model.modalities?.output;
  if (output?.includes("embeddings")) return "embeddings";
  if (output?.includes("transcription")) return "transcription";
  return "text";
};

/**
 * Applies `include` / `exclude` / `overrides`, then keeps only configured providers that
 * can serve the model (see `CanonicalIdsOptions.namespaces`). Models left without a
 * provider are dropped. Providers listed in `overrides` are always kept.
 */
export function normalizeCatalog(
  catalog: ModelCatalog,
  config: ModelCatalogConfig,
  providers: ProviderRegistry,
): ModelCatalog {
  const include = config.include && compileAll(config.include);
  const exclude = config.exclude && compileAll(config.exclude);

  const selected: ModelCatalog = {};
  for (const id in catalog) {
    if (include && !include(id)) continue;
    if (exclude?.(id)) continue;
    selected[id] = catalog[id];
  }

  const overrides = config.overrides ?? {};
  for (const [id, override] of Object.entries(overrides)) {
    const base = selected[id] ?? catalog[id];
    selected[id] = (base ? deepMerge(base, override) : override) as CatalogModel;
  }

  const out: ModelCatalog = {};
  let removed = 0;
  for (const id in selected) {
    const model = selected[id]!;
    const explicit = overrides[id]?.providers;
    const kind = kindOf(model);

    const kept = (model.providers ?? []).filter((p) => {
      const provider = providers[p];
      if (!provider) return false;
      if (explicit?.includes(p)) return true;
      return getCanonicalIdsResolver(provider)?.(id, kind) ?? true;
    });

    if (kept.length > 0) out[id] = { ...model, providers: kept };
    else removed++;
  }

  logger.debug(`[models] ${removed} models removed (no configured provider serves them)`);
  return out;
}

// Shared by every gateway (and endpoint) in the process that loads the same source.
const remote = new Map<string, Promise<ModelCatalog | null>>();

const fetchCatalog = (url: string, timeout: number) => {
  let pending = remote.get(url);
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const catalog = fromModelsDev((await res.json()) as ModelsDevApi);
      const count = Object.keys(catalog).length;
      if (count === 0) throw new Error("no models found");

      logger.info(`[models] loaded ${count} models from ${url}`);
      return catalog;
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error : new Error(String(error)) },
        `[models] could not load ${url}, using the bundled catalog`,
      );
      return null;
    }
  })();

  remote.set(url, pending);
  return pending;
};

export function createModelCatalog(
  config: ModelCatalogConfig = {},
  providers: ProviderRegistry,
): ModelCatalogStore {
  const fallback = normalizeCatalog(BUNDLED_MODEL_CATALOG, config, providers);
  const source = config.source ?? MODELS_DEV_API_URL;

  // Nothing to fetch: the bundled snapshot is all that is used, or nothing is included anyway.
  if (source === false || config.include?.length === 0) {
    if (Object.keys(fallback).length === 0) {
      throw new Error("No models configured (config.models matches no configured provider)");
    }
    return { current: fallback, load: () => Promise.resolve(fallback) };
  }

  let current: ModelCatalog | undefined;
  let pending: Promise<ModelCatalog> | undefined;

  return {
    get current() {
      return current;
    },
    load() {
      pending ??= fetchCatalog(source, config.timeout ?? DEFAULT_CATALOG_TIMEOUT_MS).then(
        (catalog) => {
          let out = catalog ? normalizeCatalog(catalog, config, providers) : fallback;
          if (Object.keys(out).length === 0) {
            logger.warn(`[models] no models match the configured providers`);
            out = fallback;
          }
          current = out;
          return out;
        },
      );
      return pending;
    },
  };
}
