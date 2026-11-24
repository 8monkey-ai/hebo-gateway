import { ReasoningEffortSchema } from "../endpoints/shared/schema.ts";
import { logger } from "../logger/index.ts";
import {
  CANONICAL_PROVIDER_IDS,
  type CanonicalProviderId,
  type ProviderId,
} from "../providers/types.ts";
import { compileGlob } from "../utils/glob.ts";
import {
  type CatalogModel,
  type ModelsDevCatalog,
  type ModelsDevCatalogModel,
  type ModelSpec,
  type ModelSpecs,
  type ReasoningControls,
} from "./types.ts";

/**
 * Catalog fetched on the first request. Any URL serving the same shape works (e.g. a
 * self-hosted copy).
 *   https://github.com/sst/models.dev#api
 */
export const MODELS_DEV_API_URL = "https://models.dev/api.json";

/** Subset of a `models.dev/api.json` model entry that the gateway reads. */
export type ModelsDevModel = {
  name?: string;
  family?: string;
  type?: string;
  status?: string;
  attachment?: boolean;
  reasoning?: boolean;
  /** How reasoning is controlled. `[]`: not at all, unset: unknown. */
  reasoning_options?:
    | (
        | { type: "effort"; values?: string[] }
        | { type: "toggle" }
        | { type: "budget_tokens"; min?: number; max?: number }
      )[]
    | null;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  /** Set when the model is served by another SDK / API than the provider's default. */
  provider?: { npm?: string };
  canonical_model_id?: string;
};

/** `models.dev/api.json`: models keyed by provider, then by provider-native model ID. */
export type ModelsDevApi = Record<string, { models?: Record<string, ModelsDevModel> }>;

/** A lab (canonical model namespace), as registered by its lab module. */
export type ModelsDevLab = {
  /** Canonical model namespace, e.g. `anthropic`. */
  namespace: string;
  /** Gateway provider run by the lab itself, listed first for its models. */
  provider?: CanonicalProviderId;
  /**
   * models.dev provider listing the lab's own models, often without `canonical_model_id`.
   * Its listing is also the preferred source of metadata.
   * @default namespace
   */
  host?: string;
  /**
   * Models (`*` patterns, without the namespace) the lab module doesn't serve, e.g. old
   * releases that would need special-casing in its middleware.
   */
  exclude?: readonly string[];
  /**
   * Models (or providers of a model) not on models.dev yet, in the snapshot's shape. They only
   * fill gaps: a model or provider listed upstream always wins. A model models.dev lists on
   * none of the gateway providers is kept when its extras name one.
   */
  extras?: ModelsDevCatalog;
};

/** A provider-native ID a models.dev provider lists a model under. */
export type ModelsDevListing = { nativeId: string; model: ModelsDevModel };

/** The listing a provider serves a model from, with provider-specific spec fields. */
export type ModelsDevPick = ModelsDevListing & { spec?: Omit<ModelSpec, "id"> };

/** How a gateway provider adapter reads a models.dev provider. */
export type ModelsDevHost = {
  /** SDKs (`provider.npm`) the adapter serves besides the provider's default one. */
  sdks?: readonly string[];
  /**
   * Picks the listing to serve a model from when the provider lists it under several native
   * IDs (e.g. once per region), `undefined` to not serve it. @default pickNativeId
   */
  pick?: (id: string, listings: readonly ModelsDevListing[]) => ModelsDevPick | undefined;
};

type Host = ModelsDevHost & { provider: ProviderId };

// models.dev providers whose ID differs from the gateway provider they back, or that need
// adapter-specific handling.
const aliases = new Map<string, Host>();

/**
 * Maps a gateway provider to the models.dev providers backing it, e.g.
 * `registerModelsDevHosts("fireworks", { "fireworks-ai": {} })`. Provider adapters
 * (`@hebo-ai/gateway/providers/<provider>`) call it when imported. Without it, a gateway
 * provider is backed by the models.dev provider of the same ID, with the defaults.
 */
export function registerModelsDevHosts(
  provider: ProviderId,
  hosts: Readonly<Record<string, ModelsDevHost>>,
): void {
  for (const host in hosts) aliases.set(host, { ...hosts[host], provider });
}

const PROVIDERS = new Set<string>(CANONICAL_PROVIDER_IDS);

const hostOf = (host: string): Host | undefined =>
  aliases.get(host) ?? (PROVIDERS.has(host) ? { provider: host } : undefined);

// Provider preference, after the lab's own: `CANONICAL_PROVIDER_IDS` order, then the others.
const rankOf = (provider: ProviderId) => {
  const rank = CANONICAL_PROVIDER_IDS.indexOf(provider as CanonicalProviderId);
  return rank === -1 ? CANONICAL_PROVIDER_IDS.length : rank;
};

type Input = NonNullable<CatalogModel["modalities"]>["input"][number];
type Output = NonNullable<CatalogModel["modalities"]>["output"][number];
type Capability = NonNullable<CatalogModel["capabilities"]>[number];

const INPUTS = new Map<string, Input>(
  Object.entries({ text: "text", image: "image", pdf: "file", audio: "audio", video: "video" }),
);

const OUTPUTS = new Map<string, Output>(
  Object.entries({ text: "text", image: "image", audio: "audio", video: "video" }),
);

// Model types the gateway serves (`undefined` is a regular chat model). Others are skipped.
const TYPES = new Set([undefined, "chat", "embedding", "transcription"]);

// Outputs at least one gateway endpoint can produce.
const SERVED = new Set<Output>(["text", "embeddings", "transcription"]);

/**
 * Native IDs end up in request URLs (e.g. Google's `/models/{id}:generateContent`, Azure
 * deployments) unencoded, so upstream ones must stay plain IDs: no `..`, `?`, `#`, `%`, … .
 */
const NATIVE_ID = /^[\w.:/@-]{1,200}$/u;

const isSafeNativeId = (nativeId: string) => NATIVE_ID.test(nativeId) && !nativeId.includes("..");

/**
 * Moving aliases (e.g. OpenAI's `gpt-chat-latest`) point to whichever model is current, so
 * they neither pin a model nor carry its name.
 */
const isMovingAlias = (nativeId: string) => nativeId.endsWith("-latest");

const isDeprecated = (model: ModelsDevModel) => model.status === "deprecated";

type Entry = {
  model: ModelsDevModel;
  /** Metadata comes from a deprecated listing only when every listing is deprecated. */
  deprecated: boolean;
  rank: number;
  /** models.dev provider and native ID of the listing `model` comes from. */
  host: string;
  nativeId: string;
  listings: Map<ProviderId, { host: Host; list: ModelsDevListing[] }>;
};

// First-party providers often list their own models without `canonical_model_id`, the
// provider-native ID being the lab one.
const canonicalIdOf = (lab: string | undefined, nativeId: string, model: ModelsDevModel) => {
  if (model.canonical_model_id) return model.canonical_model_id;
  return lab && !nativeId.includes("/") ? `${lab}/${nativeId}` : undefined;
};

/**
 * Some hosts (e.g. Azure) list well-known models without `canonical_model_id`. Their native
 * ID is then matched against the model part of every known canonical ID, if unambiguous.
 * Labs that are not registered count too (a host named like a namespace is first-party),
 * so a lab that is not imported still makes a shared name ambiguous.
 */
const indexCanonicalIds = (api: ModelsDevApi, labOf: ReadonlyMap<string, string>) => {
  const namespaces = new Set<string>();
  for (const listing of Object.values(api)) {
    for (const model of Object.values(listing?.models ?? {})) {
      const id = model?.canonical_model_id;
      if (id) namespaces.add(id.split("/", 1)[0]!);
    }
  }

  const byName = new Map<string, string | null>();
  const add = (id: string) => {
    const name = id.slice(id.indexOf("/") + 1).toLowerCase();
    const seen = byName.get(name);
    if (seen === undefined) byName.set(name, id);
    else if (seen !== id) byName.set(name, null);
  };

  for (const [host, listing] of Object.entries(api)) {
    const lab = labOf.get(host) ?? (namespaces.has(host) ? host : undefined);
    for (const [nativeId, model] of Object.entries(listing?.models ?? {})) {
      const id = canonicalIdOf(lab, nativeId, model ?? {});
      if (id) add(id);
    }
  }

  return (nativeId: string) =>
    nativeId.includes("/") ? undefined : (byName.get(nativeId.toLowerCase()) ?? undefined);
};

/**
 * Whether listing `a` is preferred over `b` for model `id` when a provider lists it under
 * several native IDs (aliases, regions, `-highspeed` variants): the one named like the model,
 * then the shortest.
 */
const isPreferred = (id: string, a: string, b: string) => {
  const name = id.slice(id.indexOf("/") + 1).toLowerCase();
  const score = (nativeId: string) =>
    nativeId.slice(nativeId.lastIndexOf("/") + 1).toLowerCase() === name ? 0 : 1;
  const diff = score(a) - score(b);
  return diff === 0 ? a.length < b.length : diff < 0;
};

/** Picks one provider-native ID when a provider lists several for the same model. */
export const pickNativeId = (
  id: string,
  listings: readonly ModelsDevListing[],
): ModelsDevListing | undefined => {
  let best: ModelsDevListing | undefined;
  for (const listing of listings) {
    if (best === undefined || isPreferred(id, listing.nativeId, best.nativeId)) best = listing;
  }
  return best;
};

/** `reasoning_options` -> reasoning controls. Unset options are unknown. */
const toReasoningControls = (
  options: ModelsDevModel["reasoning_options"],
): ReasoningControls | undefined => {
  if (!Array.isArray(options)) return undefined;

  const out: { -readonly [K in keyof ReasoningControls]: ReasoningControls[K] } = {};
  for (const option of options) {
    if (option?.type === "toggle") out.toggle = true;
    else if (option?.type === "budget_tokens") {
      const budget: NonNullable<ReasoningControls["budget"]> = {};
      if (typeof option.min === "number") budget.min = option.min;
      if (typeof option.max === "number") budget.max = option.max;
      out.budget = budget;
    } else if (option?.type === "effort" && Array.isArray(option.values)) {
      const values = new Set(option.values);
      const effort = ReasoningEffortSchema.options.filter((e) => values.has(e));
      if (effort.length > 0) out.effort = effort;
    }
  }
  return out;
};

/** How a provider serves a model: its native ID, output limit and reasoning controls. */
const toModelSpec = ({ nativeId, model, spec }: ModelsDevPick): ModelSpec => {
  const out: ModelSpec = { id: nativeId, ...spec };
  // Neither applies to embedding / transcription models.
  if (model.type !== undefined && model.type !== "chat") return out;

  if (model.limit?.output) out.output = model.limit.output;
  const reasoning = model.reasoning ? toReasoningControls(model.reasoning_options) : false;
  if (reasoning !== undefined) out.reasoning = reasoning;
  return out;
};

const toCatalogModel = (
  model: ModelsDevModel,
  providers: ModelSpecs,
  deprecated: boolean,
): ModelsDevCatalogModel => {
  const input = (model.modalities?.input ?? [])
    .map((m) => INPUTS.get(m))
    .filter((m) => m !== undefined);
  const output: Output[] =
    model.type === "embedding"
      ? ["embeddings"]
      : model.type === "transcription"
        ? ["transcription"]
        : (model.modalities?.output ?? [])
            .map((m) => OUTPUTS.get(m))
            .filter((m) => m !== undefined);

  const capabilities: Capability[] = [];
  if (model.attachment) capabilities.push("attachments");
  if (model.reasoning) capabilities.push("reasoning");
  if (model.tool_call) capabilities.push("tool_call");
  if (model.structured_output) capabilities.push("structured_output");
  if (model.temperature) capabilities.push("temperature");

  const out: Omit<ModelsDevCatalogModel, "providers"> = {};
  if (model.name) out.name = model.name;
  if (model.family) out.family = model.family;
  if (deprecated) out.status = "deprecated";
  else if (model.status === "alpha" || model.status === "beta") out.status = model.status;
  if (model.release_date) out.created = model.release_date;
  if (model.knowledge) out.knowledge = model.knowledge;
  out.modalities = { input, output };
  if (model.limit?.context) out.context = model.limit.context;
  if (capabilities.length > 0) out.capabilities = capabilities;
  return { ...out, providers };
};

/**
 * Builds a gateway catalog from `models.dev/api.json`, keyed by the models.dev canonical
 * (lab) model ID, for the given labs. Each model maps the gateway providers that serve it to
 * how they serve it: native ID, output limit and reasoning controls. Moving `-latest` aliases,
 * unsupported model types and listings with unsafe native IDs are ignored. Metadata comes
 * from the lab's own listing when there is one, otherwise from the preferred gateway provider.
 *
 * Deprecated listings are kept, but only used when nothing else is: a provider serves the
 * model from a current listing if it has one, providers serving only deprecated listings come
 * last, and a model is `deprecated` when every provider serving it only has deprecated ones.
 */
export function fromModelsDev(api: ModelsDevApi, labs: Iterable<ModelsDevLab>): ModelsDevCatalog {
  const byNamespace = new Map<string, ModelsDevLab>();
  // models.dev first-party provider -> its lab namespace.
  const labOf = new Map<string, string>();
  const excluded: ((id: string) => boolean)[] = [];
  for (const lab of labs) {
    byNamespace.set(lab.namespace, lab);
    labOf.set(lab.host ?? lab.namespace, lab.namespace);
    for (const pattern of lab.exclude ?? [])
      excluded.push(compileGlob(`${lab.namespace}/${pattern}`));
  }

  const entries = new Map<string, Entry>();
  const lookup = indexCanonicalIds(api, labOf);

  for (const [host, listing] of Object.entries(api)) {
    const models = listing?.models;
    if (!models || typeof models !== "object") continue;

    const backed = hostOf(host);
    const provider = backed?.provider;
    // Other listings only add metadata, ranked last.
    const rank = provider === undefined ? CANONICAL_PROVIDER_IDS.length + 1 : rankOf(provider);

    for (const [nativeId, model] of Object.entries(models)) {
      if (!model || typeof model !== "object") continue;
      if (!TYPES.has(model.type)) continue;
      if (isMovingAlias(nativeId)) continue;

      // Only gateway hosts are worth matching by name: other listings just add metadata.
      const id =
        canonicalIdOf(labOf.get(host), nativeId, model) ??
        (provider ? lookup(nativeId) : undefined);
      if (!id) continue;

      const namespace = id.split("/", 1)[0]!;
      if (!byNamespace.has(namespace) || excluded.some((test) => test(id))) continue;

      let entry = entries.get(id);
      // Current listings beat deprecated ones. Then the lab's own listing is the most
      // authoritative source of metadata. Within a provider, the listing named like the model
      // beats aliases and regional ones ("… (GovCloud)").
      const deprecated = isDeprecated(model);
      const ownRank = labOf.get(host) === namespace ? -1 : rank;
      if (!entry) {
        entry = { model, deprecated, rank: ownRank, host, nativeId, listings: new Map() };
        entries.set(id, entry);
      } else if (
        deprecated === entry.deprecated
          ? ownRank < entry.rank ||
            (host === entry.host && isPreferred(id, nativeId, entry.nativeId))
          : entry.deprecated
      ) {
        Object.assign(entry, { model, deprecated, rank: ownRank, host, nativeId });
      }

      // Listings served through an SDK the adapter does not speak are left out.
      const npm = model.provider?.npm;
      if (!backed || (npm !== undefined && !backed.sdks?.includes(npm))) continue;
      if (!isSafeNativeId(nativeId)) {
        logger.warn(`[models] ${id} not served on ${backed.provider}: invalid native ID`);
        continue;
      }
      const listings = entry.listings.get(backed.provider);
      if (listings) listings.list.push({ nativeId, model });
      else entry.listings.set(backed.provider, { host: backed, list: [{ nativeId, model }] });
    }
  }

  const out: ModelsDevCatalog = {};
  const ids = [...entries.keys()];
  ids.sort();

  for (const id of ids) {
    const entry = entries.get(id)!;
    const { model, listings } = entry;

    // The lab's own provider first, then the others in preference order.
    const { provider: lab, extras } = byNamespace.get(id.split("/", 1)[0]!)!;
    const ordered = [...listings.keys()].filter((p) => p !== lab);
    ordered.sort((a, b) => rankOf(a) - rankOf(b));
    if (lab && listings.has(lab)) ordered.unshift(lab);

    // Providers serving the model from current listings first, then deprecated-only ones.
    const current: Record<string, ModelSpec> = {};
    const stale: Record<string, ModelSpec> = {};
    for (const provider of ordered) {
      const { host, list } = listings.get(provider)!;
      const live = list.filter((listing) => !isDeprecated(listing.model));
      const listing = (host.pick ?? pickNativeId)(id, live.length > 0 ? live : list);
      if (listing) (live.length > 0 ? current : stale)[provider] = toModelSpec(listing);
    }
    const providers = { ...current, ...stale };
    const served = Object.keys(providers).length > 0;
    // Lab extras may name the providers models.dev doesn't list it on.
    if (!served && !extras?.[id]) continue;

    const deprecated = served ? Object.keys(current).length === 0 : entry.deprecated;
    const catalogModel = toCatalogModel(model, providers, deprecated);
    if (!catalogModel.modalities!.output.some((m) => SERVED.has(m))) continue;

    out[id] = catalogModel;
  }
  return out;
}
