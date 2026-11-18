import type { CanonicalProviderId } from "../providers/types.ts";
import type { CatalogModel, ModelCatalog } from "./types.ts";

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
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  open_weights?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number };
  /** Set when the model is served by another SDK / API than the provider's default. */
  provider?: { npm?: string };
  canonical_model_id?: string;
};

/** `models.dev/api.json`: models keyed by provider, then by provider-native model ID. */
export type ModelsDevApi = Record<string, { models?: Record<string, ModelsDevModel> }>;

/**
 * models.dev providers that back each gateway provider, with the SDKs (`provider.npm`) the
 * gateway adapter can serve besides the default one. Key order is the provider preference
 * used when a model is served by several of them (after its own lab).
 */
const HOSTS: Record<CanonicalProviderId, Record<string, readonly string[]>> = {
  anthropic: { anthropic: [] },
  openai: { openai: [] },
  alibaba: { alibaba: [] },
  cohere: { cohere: [] },
  deepseek: { deepseek: [] },
  minimax: { minimax: [] },
  moonshot: { moonshotai: [] },
  xai: { xai: [] },
  zai: { zai: [] },
  // Not listed as a provider on models.dev: picked up through `LABS` only.
  voyage: {},
  bedrock: { "amazon-bedrock": ["@ai-sdk/amazon-bedrock/mantle"] },
  vertex: {
    "google-vertex": ["@ai-sdk/google-vertex/anthropic", "@ai-sdk/openai-compatible"],
    "google-vertex-anthropic": [],
  },
  azure: { azure: [] },
  groq: { groq: [] },
  togetherai: { togetherai: [] },
  deepinfra: { deepinfra: [] },
  fireworks: { "fireworks-ai": [] },
  chutes: { chutes: [] },
};

/** Labs (canonical model namespaces) the gateway ships, with the provider each one runs. */
const LABS = new Map<string, CanonicalProviderId | null>(
  Object.entries({
    alibaba: "alibaba",
    amazon: "bedrock",
    anthropic: "anthropic",
    cohere: "cohere",
    deepseek: "deepseek",
    google: "vertex",
    meta: null,
    microsoft: "azure",
    minimax: "minimax",
    moonshotai: "moonshot",
    openai: "openai",
    voyageai: "voyage",
    xai: "xai",
    zhipuai: "zai",
  }),
);

/** Every lab namespace known to the converter. */
export const MODELS_DEV_NAMESPACES: readonly string[] = [...LABS.keys()];

/**
 * models.dev first-party providers -> their lab. They often list their own models without
 * `canonical_model_id`, the provider-native ID being the lab one. Their listing is also the
 * preferred source of metadata.
 */
const FIRST_PARTY = new Map<string, string>(
  Object.entries({
    alibaba: "alibaba",
    anthropic: "anthropic",
    cohere: "cohere",
    deepseek: "deepseek",
    google: "google",
    meta: "meta",
    minimax: "minimax",
    moonshotai: "moonshotai",
    openai: "openai",
    xai: "xai",
    zai: "zhipuai",
  }),
);

const PROVIDER_ORDER = Object.keys(HOSTS) as CanonicalProviderId[];

/** models.dev provider -> gateway provider. */
const HOST_OF = new Map<string, CanonicalProviderId>(
  PROVIDER_ORDER.flatMap((provider) =>
    Object.keys(HOSTS[provider]).map((host) => [host, provider] as const),
  ),
);

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
type Entry = { model: ModelsDevModel; rank: number; listings: Map<CanonicalProviderId, Listing[]> };

const canonicalIdOf = (host: string, nativeId: string, model: ModelsDevModel) => {
  if (model.canonical_model_id) return model.canonical_model_id;
  const lab = FIRST_PARTY.get(host);
  return lab && !nativeId.includes("/") ? `${lab}/${nativeId}` : undefined;
};

/**
 * Some hosts (e.g. Azure) list well-known models without `canonical_model_id`. Their native
 * ID is then matched against the model part of every known canonical ID, if unambiguous.
 */
const indexCanonicalIds = (api: ModelsDevApi) => {
  const byName = new Map<string, string | null>();
  const add = (id: string) => {
    const name = id.slice(id.indexOf("/") + 1).toLowerCase();
    const seen = byName.get(name);
    if (seen === undefined) byName.set(name, id);
    else if (seen !== id) byName.set(name, null);
  };

  for (const [host, listing] of Object.entries(api)) {
    for (const [nativeId, model] of Object.entries(listing?.models ?? {})) {
      const id = canonicalIdOf(host, nativeId, model ?? {});
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
const pickBedrockId = (listings: readonly Listing[]) => {
  const bare = new Map<string, { converse?: boolean; mantle?: boolean; geo?: boolean }>();
  for (const { nativeId, model } of listings) {
    const geo = BEDROCK_GEO.exec(nativeId)?.[1];
    const id = geo ? nativeId.slice(geo.length + 1) : nativeId;
    const flags = bare.get(id) ?? {};
    if (geo) flags.geo = flags.geo === true || geo !== "us-gov";
    else if (model.provider?.npm === MANTLE) flags.mantle = true;
    else flags.converse = true;
    bare.set(id, flags);
  }

  const ids = [...bare.keys()];
  ids.sort((a, b) => a.length - b.length);
  const converse = ids.find((id) => bare.get(id)!.converse);
  if (converse) return bare.get(converse)!.geo ? `{ip?}${converse}` : converse;

  const mantle = ids.find((id) => bare.get(id)!.mantle);
  if (mantle) return `mantle:${mantle}`;

  const profile = ids.find((id) => bare.get(id)!.geo);
  return profile && `{ip}${profile}`;
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

  let best: string | undefined;
  for (const { nativeId } of listings) {
    if (
      best === undefined ||
      score(nativeId) < score(best) ||
      (score(nativeId) === score(best) && nativeId.length < best.length)
    ) {
      best = nativeId;
    }
  }
  return best;
};

const toCatalogModel = (
  model: ModelsDevModel,
  providers: CatalogModel["providers"],
): CatalogModel => {
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

  const out: Omit<CatalogModel, "providers"> = {};
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
 * (lab) model ID, for the given lab namespaces. Each model maps the gateway providers that
 * serve it to their provider-native ID. Deprecated listings and unsupported model types are
 * ignored. Metadata comes from the lab's own listing when there is one, otherwise from the
 * preferred gateway provider.
 */
export function fromModelsDev(
  api: ModelsDevApi,
  namespaces: Iterable<string> = MODELS_DEV_NAMESPACES,
): ModelCatalog {
  const labs = new Set(namespaces);
  const entries = new Map<string, Entry>();
  const lookup = indexCanonicalIds(api);

  for (const [host, listing] of Object.entries(api)) {
    const models = listing?.models;
    if (!models || typeof models !== "object") continue;

    const provider = HOST_OF.get(host);
    const sdks = provider && HOSTS[provider][host];
    const rank = provider === undefined ? PROVIDER_ORDER.length : PROVIDER_ORDER.indexOf(provider);

    for (const [nativeId, model] of Object.entries(models)) {
      if (!model || typeof model !== "object") continue;
      if (model.status === "deprecated" || !TYPES.has(model.type)) continue;

      // Only gateway hosts are worth matching by name: other listings just add metadata.
      const id = canonicalIdOf(host, nativeId, model) ?? (provider ? lookup(nativeId) : undefined);
      if (!id) continue;

      const namespace = id.split("/", 1)[0]!;
      if (!labs.has(namespace) || !LABS.has(namespace)) continue;
      const lab = LABS.get(namespace);

      let entry = entries.get(id);
      // The lab's own listing is the most authoritative source of metadata.
      const ownRank = FIRST_PARTY.get(host) === namespace ? -1 : rank;
      if (!entry) entries.set(id, (entry = { model, rank: ownRank, listings: new Map() }));
      else if (ownRank < entry.rank) Object.assign(entry, { model, rank: ownRank });

      // Listings served through an SDK the adapter does not speak are left out.
      const npm = model.provider?.npm;
      if (provider && (npm === undefined || sdks!.includes(npm))) {
        const list = entry.listings.get(provider) ?? [];
        list.push({ nativeId, model });
        entry.listings.set(provider, list);
      }
      const specialized = SPECIALIZED.has(model.type!) && model.open_weights !== true;
      if (lab && specialized && !entry.listings.has(lab)) entry.listings.set(lab, []);
    }
  }

  const out: ModelCatalog = {};
  const ids = [...entries.keys()];
  ids.sort();

  for (const id of ids) {
    const { model, listings } = entries.get(id)!;

    // The lab's own provider first, then the others in preference order.
    const lab = LABS.get(id.split("/", 1)[0]!);
    const ordered = PROVIDER_ORDER.filter((p) => p !== lab && listings.has(p));
    if (lab && listings.has(lab)) ordered.unshift(lab);

    const providers: Record<string, string> = {};
    for (const provider of ordered) {
      const list = listings.get(provider)!;
      const nativeId =
        list.length === 0
          ? id.slice(id.indexOf("/") + 1)
          : provider === "bedrock"
            ? pickBedrockId(list)
            : pickNativeId(id, list);
      if (nativeId) providers[provider] = nativeId;
    }
    if (Object.keys(providers).length === 0) continue;

    const catalogModel = toCatalogModel(model, providers);
    if (!catalogModel.modalities!.output.some((m) => SERVED.has(m))) continue;

    out[id] = catalogModel;
  }
  return out;
}
