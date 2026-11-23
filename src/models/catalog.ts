import { logger } from "../logger/index.ts";
import { modelSpecsFor } from "../providers/registry.ts";
import type { ProviderRegistry } from "../providers/types.ts";
import { compileGlob } from "../utils/glob.ts";
import {
  fromModelsDev,
  MODELS_DEV_API_URL,
  type ModelsDevApi,
  type ModelsDevLab,
} from "./models-dev.ts";
import type {
  CatalogModel,
  ModelCatalog,
  ModelId,
  ModelsDevCatalog,
  ModelsDevCatalogModel,
  ModelSpec,
} from "./types.ts";

export const DEFAULT_CATALOG_TIMEOUT_MS = 2000;

/** Largest catalog response read, in bytes (`models.dev/api.json` is about 7 MB). */
export const MAX_CATALOG_SIZE = 25 * 1024 * 1024;

// --- Lab registry --------------------------------------------------------------------------

export type ModelLabConfig = ModelsDevLab & {
  /** models.dev snapshot bundled with the release, used when the live catalog cannot load. */
  snapshot: ModelsDevCatalog;
};

/** A registered lab, e.g. to define its model families with `defineModelFamily`. */
export type ModelLab = Readonly<ModelLabConfig>;

const labs = new Map<string, ModelLab>();

/** Hands the specs of `source` to every provider instance wrapped for their provider ID. */
const shareSpecs = (source: ModelsDevCatalog, replace: boolean) => {
  for (const id in source) {
    const { providers } = source[id]!;
    for (const p in providers) {
      const specs = modelSpecsFor(p);
      if (replace || !specs.has(id)) specs.set(id, providers[p]!);
    }
  }
};

/**
 * Registers the models of a lab namespace (e.g. `anthropic`). Lab modules
 * (`@hebo-ai/gateway/models/<lab>`) call it when imported: only registered labs are part of
 * the catalog.
 */
export function registerModels(lab: ModelLabConfig): ModelLab {
  labs.set(lab.namespace, lab);
  // Until the catalog loads, providers resolve native IDs from the bundled snapshot.
  shareSpecs(lab.snapshot, false);
  if (lab.extras) shareSpecs(lab.extras, false);
  return lab;
}

/** Labs registered so far, keyed by namespace. */
export const getRegisteredLabs = (): ReadonlyMap<string, ModelLab> => labs;

// --- Selections ------------------------------------------------------------------------------

const kSelect = Symbol.for("hebo.gateway.model-selection");

/**
 * Changes applied to every selected model. `providers` narrows and reorders the providers.
 * A function is called once per selected model when the catalog loads (so models released
 * later get one too), e.g. to set `additionalProperties` per model ID.
 */
export type ModelOverride =
  | Partial<CatalogModel>
  | ((id: ModelId, model: CatalogModel) => Partial<CatalogModel> | undefined);

/** Models picked from the loaded catalog, e.g. `claude.latest`. */
export type ModelSelection = {
  readonly [kSelect]: {
    namespaces: readonly string[];
    select: (source: ModelsDevCatalog) => ModelId[];
    override?: ModelOverride;
  };
};

/** A selection that can also be called with an override, e.g. `claude.opus({ ... })`. */
export type ModelGroup = ModelSelection & ((override?: ModelOverride) => ModelSelection);

const applyOverride = (
  id: ModelId,
  model: ModelsDevCatalogModel,
  override?: ModelOverride,
): ModelsDevCatalogModel => {
  const changes =
    typeof override === "function"
      ? override(id, { ...model, providers: Object.keys(model.providers) })
      : override;
  if (!changes) return model;
  const { providers, ...rest } = changes;
  if (!providers) return { ...model, ...rest };

  const picked: Record<string, ModelSpec> = {};
  for (const p of providers) {
    if (p in model.providers) picked[p] = model.providers[p]!;
  }
  return { ...model, ...rest, providers: picked };
};

/** Adds the providers of `extra` that `model` lacks, keeping the upstream ones. */
const fillProviders = (
  model: ModelsDevCatalogModel,
  extra: ModelsDevCatalogModel,
): ModelsDevCatalogModel => {
  let providers: Record<string, ModelSpec | undefined> | undefined;
  for (const p in extra.providers) {
    if (!(p in model.providers)) (providers ??= { ...model.providers })[p] = extra.providers[p]!;
  }
  return providers ? { ...model, providers } : model;
};

// Custom models list providers only: their native IDs (and specs) are left to the provider.
const withoutSpecs = (model: CatalogModel): ModelsDevCatalogModel => {
  const providers: Record<string, ModelSpec> = {};
  for (const id of model.providers) providers[id] = {};
  return { ...model, providers };
};

/** Creates a group of models, picked by `select` from the namespaces it reads. */
export function defineModelGroup(
  namespaces: readonly string[],
  select: (source: ModelsDevCatalog) => ModelId[],
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
    resolve: (source: ModelsDevCatalog) => ModelsDevCatalog;
  };
};

const namespaceOf = (id: string) => id.slice(0, Math.max(0, id.indexOf("/")));

export function defineModelCatalog(...inputs: ModelCatalogInput[]): ModelCatalogSpec {
  const namespaces = new Set<string>();
  const custom: ModelCatalog = {};
  const steps: ((source: ModelsDevCatalog, out: ModelsDevCatalog) => void)[] = [];

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
        for (const id of select(source)) out[id] = applyOverride(id, source[id]!, override);
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
        const out: ModelsDevCatalog = {};
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
   * Timeout for each attempt at loading `source`, in milliseconds. A failed attempt is
   * retried once.
   * @default 2000
   */
  timeout?: number;
};

export type ModelCatalogStore = {
  /** The catalog, once loaded. */
  readonly current: ModelCatalog | undefined;
  /**
   * Loads the catalog once, falling back to the bundled snapshot. Only rejects when no model
   * is served by a configured provider.
   */
  load(): Promise<ModelCatalog>;
};

/** Reads a JSON body, failing past `MAX_CATALOG_SIZE` bytes instead of buffering it all. */
const readJson = async (res: Response): Promise<unknown> => {
  if (Number(res.headers.get("content-length")) > MAX_CATALOG_SIZE || !res.body) {
    throw new Error(res.body ? "response too large" : "empty response");
  }

  // Decoded as it arrives, so the raw bytes are never held twice.
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let text = "";
  let size = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CATALOG_SIZE) {
      void reader.cancel();
      throw new Error("response too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode()) as unknown;
};

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

// Shared by every gateway (and endpoint) in the process that loads the same source.
const remote = new Map<string, Promise<ModelsDevCatalog | null>>();

const fetchCatalog = (url: string, read: readonly ModelLab[], timeout: number) => {
  const key = `${url}#${read.map((lab) => lab.namespace).join(",")}`;
  let pending = remote.get(key);
  if (pending) return pending;

  const attempt = async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await readJson(res)) as ModelsDevApi;
  };

  pending = (async () => {
    try {
      const api = await attempt().catch((error: unknown) => {
        logger.warn({ err: toError(error) }, `[models] could not load ${url}, retrying`);
        return attempt();
      });

      const catalog = fromModelsDev(api, read);
      const count = Object.keys(catalog).length;
      if (count === 0) throw new Error("no models found");

      logger.info(`[models] loaded ${count} models from ${url}`);
      return catalog;
    } catch (error) {
      logger.warn(
        { err: toError(error) },
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
 * only configured providers. The live model specs are handed to the providers wrapped with
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

  const read: ModelLab[] = [];
  const extras: ModelsDevCatalog = {};
  const bundled: ModelsDevCatalog = {};
  for (const ns of namespaces) {
    const lab = labs.get(ns);
    if (!lab) {
      throw new Error(
        `No models registered for '${ns}': import its lab module from "@hebo-ai/gateway/models/*"`,
      );
    }
    read.push(lab);
    Object.assign(extras, lab.extras);
    Object.assign(bundled, lab.snapshot);
  }

  const build = (upstream: ModelsDevCatalog) => {
    // Custom models, then lab extras, fill the models missing upstream. Lab extras also fill
    // the providers missing from an upstream model.
    const source: ModelsDevCatalog = { ...upstream };
    const custom = def?.custom;
    for (const id in custom) source[id] ??= withoutSpecs(custom[id]!);
    for (const id in extras) {
      const model = upstream[id];
      source[id] = model ? fillProviders(model, extras[id]!) : (source[id] ?? extras[id]);
    }
    const selected = def ? def.resolve(source) : source;

    const out: ModelCatalog = {};
    for (const id in selected) {
      const model = selected[id]!;
      const kept = Object.keys(model.providers).filter((p) => providers[p] !== undefined);
      if (kept.length > 0) out[id] = { ...model, providers: kept };
    }
    return out;
  };

  let current: ModelCatalog | undefined;

  // The live catalog, else the bundled one (whose specs lab modules share when registered).
  const settle = (upstream: ModelsDevCatalog | null) => {
    let catalog: ModelCatalog | undefined;
    if (upstream) {
      // Every model of the read labs, also for providers created outside the config (BYOK).
      shareSpecs(upstream, true);
      shareSpecs(extras, false);
      catalog = build(upstream);
      if (Object.keys(catalog).length === 0) {
        logger.warn(`[models] no live model matches the configured providers`);
        catalog = undefined;
      }
    }
    catalog ??= build(bundled);
    if (Object.keys(catalog).length === 0) {
      throw new Error(
        "No models configured: import a lab module (e.g. @hebo-ai/gateway/models/openai) or set config.models, served by a configured provider",
      );
    }
    return (current = catalog);
  };

  const source = options.source ?? MODELS_DEV_API_URL;
  const timeout = options.timeout ?? DEFAULT_CATALOG_TIMEOUT_MS;
  // Nothing to fetch when only the bundled snapshot or only custom models are used: settled
  // right away, so an empty catalog fails at startup.
  const url = source === false || namespaces.length === 0 ? undefined : source;
  let pending = url === undefined ? Promise.resolve(settle(null)) : undefined;

  return {
    get current() {
      return current;
    },
    load: () => (pending ??= fetchCatalog(url!, read, timeout).then(settle)),
  };
}
