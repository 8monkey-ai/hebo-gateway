import { logger } from "../logger/index.ts";
import { getNativeIds } from "../providers/registry.ts";
import type { ProviderId, ProviderRegistry } from "../providers/types.ts";
import { compileGlob } from "../utils/glob.ts";
import { fromModelsDev, MODELS_DEV_API_URL, type ModelsDevApi } from "./models-dev.ts";
import type { CatalogModel, ModelCatalog, ModelId } from "./types.ts";

export const DEFAULT_CATALOG_TIMEOUT_MS = 5000;

// --- Lab registry --------------------------------------------------------------------------

type Lab = { snapshot: ModelCatalog; extras: ModelCatalog };

const labs = new Map<string, Lab>();

/**
 * Registers the models of a lab namespace (e.g. `anthropic`). Lab modules
 * (`@hebo-ai/gateway/models/<lab>`) call it when imported: only registered labs are part of
 * the catalog.
 *
 * @param snapshot models.dev snapshot bundled with the release, used when the live catalog
 *   cannot be loaded.
 * @param extras Models not on models.dev yet. They only fill gaps: a model listed upstream
 *   always wins.
 */
export function registerModels(
  namespace: string,
  snapshot: ModelCatalog,
  extras: ModelCatalog = {},
): void {
  labs.set(namespace, { snapshot, extras });
}

// --- Selections ------------------------------------------------------------------------------

const kSelect = Symbol.for("hebo.gateway.model-selection");

/** Changes applied to every selected model. `providers` narrows and reorders the providers. */
export type ModelOverride = Partial<Omit<CatalogModel, "providers">> & {
  providers?: readonly ProviderId[];
};

/** Models picked from the loaded catalog, e.g. `claude.latest`. */
export type ModelSelection = {
  readonly [kSelect]: {
    namespaces: readonly string[];
    select: (source: ModelCatalog) => ModelId[];
    override?: ModelOverride;
  };
};

/** A selection that can also be called with an override, e.g. `claude.opus({ ... })`. */
export type ModelGroup = ModelSelection & ((override?: ModelOverride) => ModelSelection);

const applyOverride = (model: CatalogModel, override?: ModelOverride): CatalogModel => {
  if (!override) return model;
  const { providers, ...rest } = override;
  if (!providers) return { ...model, ...rest };

  const picked: Record<string, string> = {};
  for (const id of providers) {
    const native = model.providers[id];
    if (native !== undefined) picked[id] = native;
  }
  return { ...model, ...rest, providers: picked };
};

/** Creates a group of models, picked by `select` from the namespaces it reads. */
export function defineModelGroup(
  namespaces: readonly string[],
  select: (source: ModelCatalog) => ModelId[],
): ModelGroup {
  const withOverride = (override?: ModelOverride): ModelSelection => ({
    [kSelect]: { namespaces, select, override },
  });
  return Object.assign(withOverride, withOverride());
}

// --- Catalog definition ----------------------------------------------------------------------

/**
 * - a model ID, or an `*` pattern (e.g. `"anthropic/claude-*"`)
 * - a group exported by a lab module (e.g. `claude.latest`, `gpt["v6.x"]({ ... })`)
 * - custom models, keyed by ID. They only fill gaps until models.dev lists them: a model
 *   listed upstream always wins.
 */
export type ModelCatalogInput =
  | ModelId
  | ModelSelection
  | ModelCatalog
  // Version groups are index signatures (`claude["v5.x"]`), so they may type as undefined.
  | undefined
  | readonly ModelCatalogInput[];

const kSpec = Symbol.for("hebo.gateway.model-catalog");

/** Catalog definition, resolved against models.dev when the catalog loads. */
export type ModelCatalogSpec = {
  readonly [kSpec]: {
    /** Lab namespaces read from models.dev. */
    namespaces: ReadonlySet<string>;
    /** Custom models. */
    custom: ModelCatalog;
    resolve: (source: ModelCatalog) => ModelCatalog;
  };
};

const namespaceOf = (id: string) => id.slice(0, Math.max(0, id.indexOf("/")));

export function defineModelCatalog(...inputs: ModelCatalogInput[]): ModelCatalogSpec {
  const namespaces = new Set<string>();
  const custom: ModelCatalog = {};
  const steps: ((source: ModelCatalog, out: ModelCatalog) => void)[] = [];

  const add = (input: ModelCatalogInput) => {
    if (input === undefined) return;

    if (typeof input === "string") {
      namespaces.add(namespaceOf(input));
      const test = compileGlob(input);
      steps.push((source, out) => {
        let found = false;
        for (const id in source) {
          if (!test(id)) continue;
          out[id] = source[id];
          found = true;
        }
        if (!found) logger.warn(`[models] ${input} not found in the catalog`);
      });
      return;
    }

    if (Array.isArray(input)) {
      for (const item of input as readonly ModelCatalogInput[]) add(item);
      return;
    }

    if (kSelect in input) {
      const { namespaces: read, select, override } = input[kSelect];
      for (const ns of read) namespaces.add(ns);
      steps.push((source, out) => {
        for (const id of select(source)) out[id] = applyOverride(source[id]!, override);
      });
      return;
    }

    const models = input as ModelCatalog;
    Object.assign(custom, models);
    steps.push((source, out) => {
      for (const id in models) out[id] = source[id];
    });
  };

  for (const input of inputs) add(input);

  return {
    [kSpec]: {
      namespaces,
      custom,
      resolve: (source) => {
        const out: ModelCatalog = {};
        for (const step of steps) step(source, out);
        return out;
      },
    },
  };
}

// --- Loading -----------------------------------------------------------------------------------

export type ModelCatalogSourceConfig = {
  /**
   * URL of a models.dev `api.json` (or a self-hosted copy), loaded once, on the first
   * request. Falls back to the snapshot bundled with this release when it cannot be loaded.
   * Set to `false` to only use the bundled snapshot.
   * @default "https://models.dev/api.json"
   */
  source?: string | false;
  /**
   * Timeout for loading `source`, in milliseconds.
   * @default 5000
   */
  timeout?: number;
};

export type ModelCatalogStore = {
  /** The catalog, once loaded. */
  readonly current: ModelCatalog | undefined;
  /** Loads the catalog once. Never rejects: falls back to the bundled snapshot. */
  load(): Promise<ModelCatalog>;
};

// Shared by every gateway (and endpoint) in the process that loads the same source.
const remote = new Map<string, Promise<ModelCatalog | null>>();

const fetchCatalog = (url: string, namespaces: readonly string[], timeout: number) => {
  const key = `${url}#${namespaces.join(",")}`;
  let pending = remote.get(key);
  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const catalog = fromModelsDev((await res.json()) as ModelsDevApi, namespaces);
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

  remote.set(key, pending);
  return pending;
};

/**
 * Builds the gateway catalog from the `spec` (every registered lab when omitted), keeping
 * only configured providers. Their native IDs are handed to the providers wrapped with
 * `withCanonicalIds`.
 */
export function createModelCatalog(
  spec: ModelCatalogSpec | undefined,
  providers: ProviderRegistry,
  options: ModelCatalogSourceConfig = {},
): ModelCatalogStore {
  const def = spec?.[kSpec];
  const namespaces = [...(def?.namespaces ?? labs.keys())];
  namespaces.sort();

  const extras: ModelCatalog = {};
  const bundled: ModelCatalog = {};
  for (const ns of namespaces) {
    const lab = labs.get(ns);
    if (!lab) {
      throw new Error(
        `No models registered for '${ns}': import its lab module from "@hebo-ai/gateway/models/*"`,
      );
    }
    Object.assign(extras, lab.extras);
    Object.assign(bundled, lab.snapshot);
  }

  const build = (upstream: ModelCatalog) => {
    // Custom models, then lab extras, fill the gaps upstream.
    const source: ModelCatalog = { ...upstream };
    for (const gaps of [def?.custom, extras]) {
      for (const id in gaps) source[id] ??= gaps[id];
    }
    const selected = def ? def.resolve(source) : source;

    const out: ModelCatalog = {};
    for (const id in selected) {
      const model = selected[id]!;
      const kept: Record<string, string> = {};
      for (const p in model.providers) {
        if (providers[p]) kept[p] = model.providers[p]!;
      }
      if (Object.keys(kept).length > 0) out[id] = { ...model, providers: kept };
    }

    for (const key in providers) {
      const ids = getNativeIds(providers[key]!);
      if (!ids) continue;
      for (const id in out) {
        const native = out[id]!.providers[key];
        if (native !== undefined) ids.set(id, native);
      }
    }
    return out;
  };

  const source = options.source ?? MODELS_DEV_API_URL;

  // Nothing to fetch: the bundled snapshot is all that is used, or only custom models are.
  if (source === false || namespaces.length === 0) {
    const catalog = build(bundled);
    if (Object.keys(catalog).length === 0) {
      throw new Error(
        "No models configured: import a lab module (e.g. @hebo-ai/gateway/models/openai) or set config.models, served by a configured provider",
      );
    }
    return { current: catalog, load: () => Promise.resolve(catalog) };
  }

  let current: ModelCatalog | undefined;
  let pending: Promise<ModelCatalog> | undefined;

  return {
    get current() {
      return current;
    },
    load() {
      pending ??= fetchCatalog(
        source,
        namespaces,
        options.timeout ?? DEFAULT_CATALOG_TIMEOUT_MS,
      ).then((upstream) => {
        let catalog = upstream ? build(upstream) : undefined;
        if (!catalog || Object.keys(catalog).length === 0) {
          if (catalog) logger.warn(`[models] no live model matches the configured providers`);
          catalog = build(bundled);
        }
        if (Object.keys(catalog).length === 0) {
          logger.warn(`[models] no model is served by a configured provider`);
        }
        current = catalog;
        return catalog;
      });
      return pending;
    },
  };
}
