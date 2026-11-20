import { ReasoningEffortSchema } from "../endpoints/shared/schema.ts";
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
  open_weights?: boolean;
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
};

/** A models.dev provider backing a gateway provider. */
type Host = {
  provider: ProviderId;
  /** SDKs (`provider.npm`) the gateway adapter serves besides the provider's default one. */
  sdks: readonly string[];
};

// models.dev providers whose ID differs from the gateway provider they back.
const aliases = new Map<string, Host>();

/**
 * Maps a gateway provider to the models.dev providers backing it, with the SDKs
 * (`provider.npm`) its adapter serves besides the default one, e.g.
 * `registerModelsDevHosts("bedrock", { "amazon-bedrock": ["@ai-sdk/amazon-bedrock/mantle"] })`.
 * Provider adapters (`@hebo-ai/gateway/providers/<provider>`) call it when imported. Without
 * it, a gateway provider is backed by the models.dev provider of the same ID.
 */
export function registerModelsDevHosts(
  provider: ProviderId,
  hosts: Readonly<Record<string, readonly string[]>>,
): void {
  for (const host in hosts) aliases.set(host, { provider, sdks: hosts[host]! });
}

const PROVIDERS = new Set<string>(CANONICAL_PROVIDER_IDS);

const hostOf = (host: string): Host | undefined =>
  aliases.get(host) ?? (PROVIDERS.has(host) ? { provider: host, sdks: [] } : undefined);

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

// models.dev rarely lists embedding / transcription models under the lab's own provider,
// so closed-weight ones are assumed to be served by their lab.
const SPECIALIZED = new Set(["embedding", "transcription"]);

const MANTLE = "@ai-sdk/amazon-bedrock/mantle";

/** Bedrock cross-region inference profile prefixes. `us-gov` is opt-in only. */
const BEDROCK_GEO = /^(global|us|eu|apac|au|ca|jp|in|us-gov)\./u;

type Listing = { nativeId: string; model: ModelsDevModel };
type Entry = { model: ModelsDevModel; rank: number; listings: Map<ProviderId, Listing[]> };

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
 * Bedrock lists a model once per inference profile (`us.`, `global.`, …) and sometimes
 * once more on Mantle. Prefers Converse, collapsing the profiles into `{ip}` (required) or
 * `{ip?}` (optional, when the bare ID is listed too), then Mantle.
 */
const pickBedrockId = (listings: readonly Listing[]): Listing | undefined => {
  const bare = new Map<
    string,
    { converse?: boolean; mantle?: boolean; geo?: boolean; model: ModelsDevModel }
  >();
  for (const { nativeId, model } of listings) {
    const geo = BEDROCK_GEO.exec(nativeId)?.[1];
    const id = geo ? nativeId.slice(geo.length + 1) : nativeId;
    const flags = bare.get(id) ?? { model };
    if (geo) flags.geo = flags.geo === true || geo !== "us-gov";
    else if (model.provider?.npm === MANTLE) flags.mantle = true;
    else flags.converse = true;
    bare.set(id, flags);
  }

  const ids = [...bare.keys()];
  ids.sort((a, b) => a.length - b.length);
  const pick = (nativeId: string, id: string) => ({ nativeId, model: bare.get(id)!.model });

  const converse = ids.find((id) => bare.get(id)!.converse);
  if (converse) return pick(bare.get(converse)!.geo ? `{ip?}${converse}` : converse, converse);

  const mantle = ids.find((id) => bare.get(id)!.mantle);
  if (mantle) return pick(`mantle:${mantle}`, mantle);

  const profile = ids.find((id) => bare.get(id)!.geo);
  return profile ? pick(`{ip}${profile}`, profile) : undefined;
};

/**
 * Picks one provider-native ID when a provider lists several for the same model (aliases,
 * `-highspeed` variants, Fireworks routers): the one named like the model, then the shortest.
 */
const pickNativeId = (id: string, listings: readonly Listing[]) => {
  const name = id.slice(id.indexOf("/") + 1).toLowerCase();
  const score = (nativeId: string) =>
    (nativeId.slice(nativeId.lastIndexOf("/") + 1).toLowerCase() === name ? 0 : 2) +
    (nativeId.includes("/routers/") ? 4 : 0);

  let best: Listing | undefined;
  for (const listing of listings) {
    const { nativeId } = listing;
    if (
      best === undefined ||
      score(nativeId) < score(best.nativeId) ||
      (score(nativeId) === score(best.nativeId) && nativeId.length < best.nativeId.length)
    ) {
      best = listing;
    }
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
const toModelSpec = (nativeId: string, model: ModelsDevModel): ModelSpec => {
  const out: ModelSpec = { id: nativeId };
  // Neither applies to embedding / transcription models.
  if (model.type !== undefined && model.type !== "chat") return out;

  if (model.limit?.output) out.output = model.limit.output;
  const reasoning = model.reasoning ? toReasoningControls(model.reasoning_options) : false;
  if (reasoning !== undefined) out.reasoning = reasoning;
  return out;
};

const toCatalogModel = (model: ModelsDevModel, providers: ModelSpecs): ModelsDevCatalogModel => {
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
  if (model.status === "alpha" || model.status === "beta") out.status = model.status;
  if (model.release_date) out.created = model.release_date;
  if (model.knowledge) out.knowledge = model.knowledge;
  out.modalities = { input, output };
  if (model.limit?.context) out.context = model.limit.context;
  if (capabilities.length > 0) out.capabilities = capabilities;
  return { ...out, providers };
};

/**
 * Builds a gateway catalog from `models.dev/api.json`, keyed by the models.dev canonical
 * (lab) model ID, for the given labs. Each model maps the gateway providers that
 * serve it to how they serve it: native ID, output limit and reasoning controls. Deprecated listings and unsupported model types are
 * ignored. Metadata comes from the lab's own listing when there is one, otherwise from the
 * preferred gateway provider.
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
      if (model.status === "deprecated" || !TYPES.has(model.type)) continue;

      // Only gateway hosts are worth matching by name: other listings just add metadata.
      const id =
        canonicalIdOf(labOf.get(host), nativeId, model) ??
        (provider ? lookup(nativeId) : undefined);
      if (!id) continue;

      const namespace = id.split("/", 1)[0]!;
      if (!byNamespace.has(namespace) || excluded.some((test) => test(id))) continue;
      const lab = byNamespace.get(namespace)!.provider;

      let entry = entries.get(id);
      // The lab's own listing is the most authoritative source of metadata.
      const ownRank = labOf.get(host) === namespace ? -1 : rank;
      if (!entry) entries.set(id, (entry = { model, rank: ownRank, listings: new Map() }));
      else if (ownRank < entry.rank) Object.assign(entry, { model, rank: ownRank });

      // Listings served through an SDK the adapter does not speak are left out.
      const npm = model.provider?.npm;
      if (provider && (npm === undefined || backed.sdks.includes(npm))) {
        const list = entry.listings.get(provider) ?? [];
        list.push({ nativeId, model });
        entry.listings.set(provider, list);
      }
      const specialized = SPECIALIZED.has(model.type!) && model.open_weights !== true;
      if (lab && specialized && !entry.listings.has(lab)) entry.listings.set(lab, []);
    }
  }

  const out: ModelsDevCatalog = {};
  const ids = [...entries.keys()];
  ids.sort();

  for (const id of ids) {
    const { model, listings } = entries.get(id)!;

    // The lab's own provider first, then the others in preference order.
    const lab = byNamespace.get(id.split("/", 1)[0]!)!.provider;
    const ordered = [...listings.keys()].filter((p) => p !== lab);
    ordered.sort((a, b) => rankOf(a) - rankOf(b));
    if (lab && listings.has(lab)) ordered.unshift(lab);

    const providers: Record<string, ModelSpec> = {};
    for (const provider of ordered) {
      const list = listings.get(provider)!;
      if (list.length === 0) {
        providers[provider] = { id: id.slice(id.indexOf("/") + 1) };
        continue;
      }
      const listing = provider === "bedrock" ? pickBedrockId(list) : pickNativeId(id, list);
      if (listing) providers[provider] = toModelSpec(listing.nativeId, listing.model);
    }
    if (Object.keys(providers).length === 0) continue;

    const catalogModel = toCatalogModel(model, providers);
    if (!catalogModel.modalities!.output.some((m) => SERVED.has(m))) continue;

    out[id] = catalogModel;
  }
  return out;
}
