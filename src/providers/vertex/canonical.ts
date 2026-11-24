import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";
import {
  createVertexAnthropic,
  type GoogleVertexAnthropicProvider,
} from "@ai-sdk/google-vertex/anthropic";
import {
  createVertexMaas,
  type GoogleVertexMaasProvider,
  type GoogleVertexMaasProviderSettings,
} from "@ai-sdk/google-vertex/maas";

import { logger } from "../../logger/index.ts";
import {
  pickNativeId,
  registerModelsDevHosts,
  type ModelsDevListing,
} from "../../models/models-dev.ts";
import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

// models.dev lists Claude as `claude-sonnet-5-5@default`; Vertex documents the bare ID.
//   https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed
const pick = (id: string, listings: readonly ModelsDevListing[]) => {
  const listing = pickNativeId(id, listings);
  return listing && { ...listing, nativeId: listing.nativeId.replace(/@default$/u, "") };
};

// Claude has its own models.dev provider. MaaS models are listed as OpenAI-compatible.
registerModelsDevHosts("vertex", {
  "google-vertex": {
    sdks: ["@ai-sdk/google-vertex/anthropic", "@ai-sdk/openai-compatible"],
    pick,
  },
  "google-vertex-anthropic": { pick },
});

/**
 * `createVertex` keeps `project` and `googleAuthOptions` in a closure, so the resolved
 * base URL, auth headers, and fetch are only reachable through the config the AI SDK
 * attaches to a model instance.
 */
type VertexModelConfig = {
  baseURL?: string;
  headers?: GoogleVertexMaasProviderSettings["headers"];
  fetch?: GoogleVertexMaasProviderSettings["fetch"];
};

/**
 * Settings that make a nested Vertex provider (MaaS, Claude) use the wrapped provider's
 * project, fetch, headers and credentials. None in express mode (API key): it
 * resolves no project into its base URL, and neither endpoint takes API keys, so that path
 * keeps the nested provider's defaults (env vars + ADC).
 */
const inheritSettings = (provider: GoogleVertexProvider) => {
  // Any model id works: constructing a model issues no request, it only resolves settings.
  const { config } = provider.languageModel("gemini-3.7-flash") as unknown as {
    config: VertexModelConfig;
  };

  const project = config.baseURL?.split("/projects/")[1]?.split("/")[0];
  if (!project) return {};

  // Resolved per request: the bearer token expires. Keys are lower-cased by the SDK.
  const resolveVertexHeaders = async () => {
    const { headers } = config;
    return (typeof headers === "function" ? await headers() : await headers) ?? {};
  };

  return {
    project,
    fetch: config.fetch,
    // The nested providers append their own capitalized `Authorization`, so leaving the
    // lower-cased one in would send both tokens comma-joined in a single header.
    headers: async () => {
      const { authorization: _dropped, ...rest } = await resolveVertexHeaders();
      return rest;
    },
    // They mint their own token, defaulting to ambient credentials. Handing them the token
    // the native provider already resolved keeps all of them on the configured credentials.
    googleAuthOptions: {
      authClient: {
        getAccessToken: async () => ({
          token: (await resolveVertexHeaders())["authorization"]?.slice("Bearer ".length) ?? null,
        }),
      },
    } as unknown as GoogleVertexMaasProviderSettings["googleAuthOptions"],
  };
};

// Both are served from the global endpoint: MaaS serves partner and open models (e.g.
// `google/gemma-4-26b-a4b-it-maas`, native IDs carry a publisher) only there, and regional
// endpoints serve no Claude model newer than Sonnet 4.6.
//   https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed
const createMaas = (provider: GoogleVertexProvider): GoogleVertexMaasProvider =>
  createVertexMaas({ ...inheritSettings(provider), location: "global" });

// Claude takes the Anthropic request shape on `rawPredict`, not `generateContent`.
const createAnthropic = (provider: GoogleVertexProvider): GoogleVertexAnthropicProvider =>
  createVertexAnthropic({ ...inheritSettings(provider), location: "global" });

export const withCanonicalIdsForVertex = (
  provider: GoogleVertexProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) => {
  // Deferred so incomplete settings surface at model construction, not at wrap time.
  let maas: GoogleVertexMaasProvider | undefined;
  let anthropic: GoogleVertexAnthropicProvider | undefined;

  return withCanonicalIds(
    {
      ...provider,
      languageModel: (id: string) => {
        if (id.includes("/")) {
          maas ??= createMaas(provider);
          return maas.languageModel(id);
        }
        if (id.startsWith("claude-")) {
          logger.debug(`[canonical] serving ${id} from vertex anthropic`);
          anthropic ??= createAnthropic(provider);
          return anthropic.languageModel(id);
        }
        return provider.languageModel(id);
      },
    },
    {
      providerId: "vertex",
      mapping: extraMapping,
      options: {
        stripNamespace: true,
      },
    },
  );
};
