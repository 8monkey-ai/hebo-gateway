import { type AmazonBedrockProvider } from "@ai-sdk/amazon-bedrock";
import {
  type AmazonBedrockAnthropicProvider,
  type AmazonBedrockAnthropicProviderSettings,
  createAmazonBedrockAnthropic,
} from "@ai-sdk/amazon-bedrock/anthropic";
import {
  type BedrockMantleProvider,
  type BedrockMantleProviderSettings,
  createBedrockMantle,
} from "@ai-sdk/amazon-bedrock/mantle";
import type { LanguageModelV4 } from "@ai-sdk/provider";

import { logger } from "../../logger/index.ts";
import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

type BedrockFetch = NonNullable<AmazonBedrockAnthropicProviderSettings["fetch"]>;

type BedrockModelConfig = {
  baseUrl: () => string;
  headers: () => Record<string, string | undefined>;
  fetch?: BedrockFetch;
};

/**
 * `createAmazonBedrock` keeps `region`, its credentials and its auth fetch in a closure, so
 * they are only reachable through the config the AI SDK attaches to a model instance.
 */
const resolveBedrockConfig = (provider: AmazonBedrockProvider, nested: string) => {
  // Any model id works: constructing a model issues no request, it only resolves settings.
  const { config } = provider.languageModel("amazon.nova-lite-v1:0") as unknown as {
    config: BedrockModelConfig;
  };

  let baseURL: string | undefined;
  let headers: Record<string, string | undefined> | undefined;
  try {
    // Headers first: they resolve unconditionally, while the base URL throws on a missing
    // region, and losing that is no reason to drop the inherited headers too.
    headers = config.headers();
    baseURL = config.baseUrl();
  } catch {
    // Region is unresolvable (neither `region` nor `AWS_REGION` is set). Let the nested
    // provider load its own settings so the error surfaces from there instead.
    logger.debug(`[canonical] could not resolve the bedrock base url for ${nested}`);
  }

  return { baseURL, headers, fetch: config.fetch };
};

/** `https://bedrock-runtime.us-east-1.amazonaws.com` -> `us-east-1` */
const REGION_FROM_BASE_URL = /^https?:\/\/[^./]+\.([^./]+)\./u;

/** A custom base URL need not carry a region in that label: `us-east-1`, `us-gov-west-1` */
const AWS_REGION = /^[a-z]{2}(?:-[a-z]+)+-\d+$/u;

const resolveMantle = (
  provider: AmazonBedrockProvider,
  settings: BedrockMantleProviderSettings = {},
): BedrockMantleProvider => {
  const { baseURL, headers } = resolveBedrockConfig(provider, "mantle");
  const parsed = baseURL && REGION_FROM_BASE_URL.exec(baseURL)?.[1];
  // A custom base URL can hold anything in that label, and a wrong region would only
  // surface as a DNS failure. Keep it only when it looks like a region.
  const region = parsed && AWS_REGION.test(parsed) ? parsed : undefined;

  // Credentials are not readable back off a provider instance: they never leave the
  // `createAmazonBedrock` closure, and its SigV4 fetch cannot be borrowed either because it
  // signs for the `bedrock` service while Mantle requires `bedrock-mantle`. Mantle therefore
  // loads its own, exactly like the Vertex adapter falls back to ambient credentials in
  // express mode: `AWS_BEARER_TOKEN_BEDROCK` / `AWS_ACCESS_KEY_ID` cover both endpoints, and
  // `config.mantle` is the explicit override.
  return createBedrockMantle({
    ...settings,
    region: settings.region ?? region,
    headers: settings.headers ?? headers,
  });
};

/** Settings that make the nested provider authenticate itself instead of inheriting. */
const OWN_AUTH_SETTINGS = [
  "apiKey",
  "accessKeyId",
  "secretAccessKey",
  "sessionToken",
  "credentialProvider",
  "fetch",
] as const satisfies readonly (keyof AmazonBedrockAnthropicProviderSettings)[];

/**
 * Placeholder that keeps the nested provider off its own credential resolution. The
 * inherited fetch applies the wrapped provider's auth, and this header never gets sent.
 */
const INHERITED_AUTH = "inherited";

const AUTHORIZATION = "authorization";

/** The length check keeps the per-request header scan off `toLowerCase` for every key. */
const isAuthorization = (key: string) =>
  key.length === AUTHORIZATION.length && key.toLowerCase() === AUTHORIZATION;

const withoutAuthorization = (headers: HeadersInit): Record<string, string> => {
  const out: Record<string, string> = {};

  // The AI SDK always hands over a plain record; iterating it directly keeps this off
  // `Object.entries`, which allocates an array per header on every request.
  if (!(headers instanceof Headers) && !Array.isArray(headers)) {
    for (const key in headers) {
      const value = headers[key];
      // `undefined` values would be stringified by `Headers`.
      if (value === undefined || isAuthorization(key)) continue;
      out[key] = value;
    }
    return out;
  }

  for (const [key, value] of headers) {
    if (value === undefined || isAuthorization(key)) continue;
    out[key] = value;
  }
  return out;
};

// Converse cannot express the Anthropic request shape: no mid-conversation `system` turns
// (which Claude Code sends), no `anthropic_beta`, no native `cache_control`. InvokeModel
// takes the Anthropic body verbatim, so Claude is served from there instead.
//   https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
const resolveAnthropic = (
  provider: AmazonBedrockProvider,
  settings: AmazonBedrockAnthropicProviderSettings = {},
): AmazonBedrockAnthropicProvider => {
  // InvokeModel lives on the same `bedrock-runtime` host as Converse, custom base URL
  // included, so the resolved one carries over as is.
  const { baseURL, headers, fetch } = resolveBedrockConfig(provider, "anthropic");

  const inherited = {
    ...settings,
    // An explicit nested `region` resolves its own host, so the inherited one cannot win.
    baseURL: settings.baseURL ?? (settings.region ? undefined : baseURL),
    headers: settings.headers ?? headers,
  };

  // Explicit credentials win: the nested provider then signs for itself.
  if (OWN_AUTH_SETTINGS.some((key) => settings[key] !== undefined)) {
    return createAmazonBedrockAnthropic(inherited);
  }

  // Unlike Mantle, InvokeModel signs for the same `bedrock` service as Converse, so the
  // wrapped provider's fetch signs these requests too — credentials (including a
  // `credentialProvider`) are inherited instead of having to be configured twice.
  const baseFetch: BedrockFetch = fetch ?? globalThis.fetch;
  // The cast only drops the runtime-specific extras of `typeof globalThis.fetch`
  // (`preconnect` on Bun), which a request-signing wrapper has no use for.
  // The AI SDK always passes a URL plus `init`; a `Request` instance would carry its
  // headers out of reach here and leak the placeholder to the signing fetch.
  const inheritedFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    baseFetch(
      input,
      init?.headers ? { ...init, headers: withoutAuthorization(init.headers) } : init,
    )) as BedrockFetch;

  return createAmazonBedrockAnthropic({
    ...inherited,
    apiKey: INHERITED_AUTH,
    fetch: inheritedFetch,
  });
};

/**
 * Lookups are keyed by the caller-supplied id, so the memo is bounded like
 * `ModelMiddlewareMatcher`'s: the gateway only ever asks for catalog ids, but
 * `withCanonicalIdsForBedrock` is public API.
 */
const MAX_MEMOIZED_MODELS = 500;

const memoize = (create: (id: string) => LanguageModelV4) => {
  const models = new Map<string, LanguageModelV4>();
  return (id: string) => {
    let model = models.get(id);
    if (model) return model;
    model = create(id);
    if (models.size >= MAX_MEMOIZED_MODELS) models.clear();
    models.set(id, model);
    return model;
  };
};

/** Native IDs of models served by the OpenAI-compatible Mantle endpoint (see the catalog). */
const MANTLE_PREFIX = "mantle:";

export type BedrockInferenceProfileOptions = {
  /** @default "preferred" */
  mode?: "preferred" | "avoid";
  /** @default "us" */
  // oxlint-disable-next-line ban-types
  geo?: "global" | "us" | "eu" | "apac" | "au" | "ca" | "jp" | "us-gov" | (string & {});
  arn?: { region: string; accountId: string };
};

const resolveInferenceProfile = ({ geo = "us", arn }: BedrockInferenceProfileOptions = {}) =>
  `${arn ? `arn:aws:bedrock:${arn.region}:${arn.accountId}:inference-profile/` : ""}${geo}.`;

export type BedrockCanonicalConfig = {
  inferenceProfile?: BedrockInferenceProfileOptions;
  extraMapping?: Partial<Record<ModelId, string>>;
  /**
   * Settings for the nested Mantle provider, which serves the models the catalog lists on
   * Mantle (e.g. GPT-5.x, native IDs starting with `mantle:`). `region` and
   * custom headers are inherited from the wrapped provider; credentials are not, so set them
   * here unless the ambient AWS environment already carries them.
   */
  mantle?: BedrockMantleProviderSettings;
  /**
   * Settings for the nested Anthropic provider, which serves the Claude models through
   * `InvokeModel` instead of Converse. The base URL, custom headers and credentials of the
   * wrapped provider are inherited; set them here to override. Pass `false` to keep Claude
   * on Converse, at the cost of the Anthropic-native request shape.
   */
  anthropic?: AmazonBedrockAnthropicProviderSettings | false;
};

export const withCanonicalIdsForBedrock = (
  provider: AmazonBedrockProvider,
  config: BedrockCanonicalConfig = {},
) => {
  const ip = resolveInferenceProfile(config.inferenceProfile);
  const avoid = config.inferenceProfile?.mode === "avoid";

  // Deferred so incomplete settings surface at model construction, not at wrap time.
  let mantle: BedrockMantleProvider | undefined;
  let anthropic: AmazonBedrockAnthropicProvider | undefined;

  // Served only from Mantle, never from Converse/Invoke on `bedrock-runtime`.
  //   https://docs.aws.amazon.com/bedrock/latest/userguide/inference-mantle.html
  const mantleModel = memoize((id) => {
    mantle ??= resolveMantle(provider, config.mantle);
    // These models expect the Responses API; Chat Completions is the Mantle default.
    return mantle.responses(id);
  });

  // InvokeModel takes the exact same IDs as Converse, inference profiles included.
  const anthropicModel = memoize((id) => {
    anthropic ??= resolveAnthropic(
      provider,
      config.anthropic === false ? undefined : config.anthropic,
    );
    return anthropic.languageModel(id);
  });

  // Routes on the native ID the canonical ID resolved to.
  const languageModel = (id: string) => {
    if (id.startsWith(MANTLE_PREFIX)) {
      logger.debug(`[canonical] serving ${id} from mantle`);
      return mantleModel(id.slice(MANTLE_PREFIX.length));
    }
    if (config.anthropic !== false && id.includes("anthropic.claude")) {
      logger.debug(`[canonical] serving ${id} from invoke`);
      return anthropicModel(id);
    }
    return provider.languageModel(id);
  };

  return withCanonicalIds(
    { ...provider, languageModel },
    {
      mapping: config.extraMapping,
      options: {
        stripNamespace: false,
        namespaceSeparator: ".",
        normalizeDelimiters: true,
        prefix: avoid ? "" : ip,
        // `{ip}`: the model is only served through an inference profile, `{ip?}`: on demand too.
        template: { ip, "ip?": avoid ? "" : ip },
        postfix: avoid ? "" : "-v1:0",
      },
    },
  );
};
