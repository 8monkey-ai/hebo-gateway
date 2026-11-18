import type { CanonicalProviderId } from "../providers/types.ts";
import type { CatalogModel, ModelCatalog } from "./types.ts";

/**
 * Catalog fetched at startup. Any URL serving the same shape works (e.g. a self-hosted copy).
 *   https://github.com/sst/models.dev#api
 */
export const MODELS_DEV_API_URL = "https://models.dev/api.json";

/** Subset of a `models.dev/api.json` model entry that the gateway reads. */
export type ModelsDevModel = {
  name?: string;
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
  canonical_model_id?: string;
};

/** `models.dev/api.json`: models keyed by provider, then by provider-native model ID. */
export type ModelsDevApi = Record<string, { models?: Record<string, ModelsDevModel> }>;

/**
 * models.dev providers that back each gateway provider. Key order is the provider
 * preference used when a model is served by several of them (after its own lab).
 */
const HOSTS: Record<CanonicalProviderId, readonly string[]> = {
  anthropic: ["anthropic"],
  openai: ["openai"],
  alibaba: ["alibaba"],
  cohere: ["cohere"],
  deepseek: ["deepseek"],
  minimax: ["minimax"],
  moonshot: ["moonshotai"],
  xai: ["xai"],
  zai: ["zai"],
  // Not listed as a provider on models.dev: picked up through `LABS` only.
  voyage: [],
  bedrock: ["amazon-bedrock"],
  vertex: ["google-vertex", "google-vertex-anthropic"],
  azure: ["azure"],
  groq: ["groq"],
  togetherai: ["togetherai"],
  deepinfra: ["deepinfra"],
  fireworks: ["fireworks-ai"],
  chutes: ["chutes"],
};

/**
 * Labs (canonical model namespaces) kept in the catalog, with the gateway provider each one
 * runs. Models of other labs are left out, as the gateway ships no model middleware for them.
 */
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
  PROVIDER_ORDER.flatMap((provider) => HOSTS[provider].map((host) => [host, provider] as const)),
);

type Input = NonNullable<CatalogModel["modalities"]>["input"][number];
type Output = NonNullable<CatalogModel["modalities"]>["output"][number];
type Capability = NonNullable<CatalogModel["capabilities"]>[number];

const INPUTS = new Map<string, Input>(
  Object.entries({
    text: "text",
    image: "image",
    pdf: "file",
    audio: "audio",
    video: "video",
  }),
);

const OUTPUTS = new Map<string, Output>(
  Object.entries({
    text: "text",
    image: "image",
    audio: "audio",
    video: "video",
  }),
);

// Model types the gateway serves (`undefined` is a regular chat model). Others are skipped.
const TYPES = new Set([undefined, "chat", "embedding", "transcription"]);

// Outputs at least one gateway endpoint can produce.
const SERVED = new Set<Output>(["text", "embeddings", "transcription"]);

// models.dev rarely lists embedding / transcription models under the lab's own provider,
// so closed-weight ones are assumed to be served by their lab.
const SPECIALIZED = new Set(["embedding", "transcription"]);

type Entry = { model: ModelsDevModel; rank: number };

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

const toCatalogModel = (model: ModelsDevModel, providers: CanonicalProviderId[]): CatalogModel => {
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
  if (model.release_date) out.created = model.release_date;
  if (model.knowledge) out.knowledge = model.knowledge;
  out.modalities = { input, output };
  if (model.limit?.context) out.context = model.limit.context;
  if (capabilities.length > 0) out.capabilities = capabilities;
  return { ...out, providers };
};

/**
 * Builds a gateway catalog from `models.dev/api.json`, keyed by the models.dev canonical
 * (lab) model ID. A model is kept when at least one gateway provider serves it; deprecated
 * listings and unsupported model types are ignored. Metadata comes from the lab's own
 * listing when there is one, otherwise from the preferred gateway provider.
 */
export function fromModelsDev(api: ModelsDevApi): ModelCatalog {
  const entries = new Map<string, { best: Entry; providers: Set<CanonicalProviderId> }>();
  const lookup = indexCanonicalIds(api);

  for (const [host, listing] of Object.entries(api)) {
    const models = listing?.models;
    if (!models || typeof models !== "object") continue;

    const provider = HOST_OF.get(host);
    const rank = provider === undefined ? PROVIDER_ORDER.length : PROVIDER_ORDER.indexOf(provider);

    for (const [nativeId, model] of Object.entries(models)) {
      if (!model || typeof model !== "object") continue;
      if (model.status === "deprecated" || !TYPES.has(model.type)) continue;

      // Only gateway hosts are worth matching by name: other listings just add metadata.
      const id = canonicalIdOf(host, nativeId, model) ?? (provider ? lookup(nativeId) : undefined);
      if (!id) continue;

      const namespace = id.split("/", 1)[0]!;
      if (!LABS.has(namespace)) continue;
      const lab = LABS.get(namespace);
      // The lab's own listing is the most authoritative source of metadata.
      const entry: Entry = { model, rank: FIRST_PARTY.get(host) === namespace ? -1 : rank };

      let item = entries.get(id);
      if (!item) entries.set(id, (item = { best: entry, providers: new Set() }));
      else if (entry.rank < item.best.rank) item.best = entry;

      if (provider) item.providers.add(provider);
      if (lab && SPECIALIZED.has(model.type!) && model.open_weights !== true) {
        item.providers.add(lab);
      }
    }
  }

  const out: ModelCatalog = {};
  const ids = [...entries.keys()];
  ids.sort();

  for (const id of ids) {
    const { best, providers } = entries.get(id)!;
    if (providers.size === 0) continue;

    // The lab's own provider first, then the others in preference order.
    const lab = LABS.get(id.split("/", 1)[0]!);
    const ordered = PROVIDER_ORDER.filter((p) => p !== lab && providers.has(p));
    if (lab && providers.has(lab)) ordered.unshift(lab);

    const model = toCatalogModel(best.model, ordered);
    if (!model.modalities!.output.some((m) => SERVED.has(m))) continue;

    out[id] = model;
  }
  return out;
}
