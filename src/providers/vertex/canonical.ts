import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";
import {
  createVertexMaas,
  type GoogleVertexMaasProvider,
  type GoogleVertexMaasProviderSettings,
} from "@ai-sdk/google-vertex/maas";
import { customProvider } from "ai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b-instruct-2507-maas",
  "deepseek/deepseek-v3.2": "deepseek-v3.2-maas",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

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

// Gemma thinking is not exposed via generateContent, so it routes through the
// MaaS endpoint, which serves Gemma only from the global endpoint.
const createMaas = (provider: GoogleVertexProvider): GoogleVertexMaasProvider => {
  // Any model id works: constructing a model issues no request, it only resolves settings.
  const { config } = provider.languageModel("gemini-2.5-flash") as unknown as {
    config: VertexModelConfig;
  };

  // Express mode (API key) resolves no project into its base URL, and MaaS rejects API
  // keys anyway, so that path keeps the MaaS defaults (env vars + ADC).
  const project = config.baseURL?.split("/projects/")[1]?.split("/")[0];
  if (!project) return createVertexMaas({ location: "global" });

  // Resolved per request: the bearer token expires. Keys are lower-cased by the SDK.
  const resolveVertexHeaders = async () => {
    const { headers } = config;
    return (typeof headers === "function" ? await headers() : await headers) ?? {};
  };

  return createVertexMaas({
    project,
    location: "global",
    fetch: config.fetch,
    // MaaS appends its own capitalized `Authorization`, so leaving the lower-cased one
    // in would send both tokens comma-joined in a single header.
    headers: async () => {
      const { authorization: _dropped, ...rest } = await resolveVertexHeaders();
      return rest;
    },
    // MaaS mints its own token, defaulting to ambient credentials. Handing it the token
    // the native provider already resolved keeps both on the configured credentials.
    googleAuthOptions: {
      authClient: {
        getAccessToken: async () => ({
          token: (await resolveVertexHeaders())["authorization"]?.slice("Bearer ".length) ?? null,
        }),
      },
    } as unknown as GoogleVertexMaasProviderSettings["googleAuthOptions"],
  });
};

export const withCanonicalIdsForVertex = (
  provider: GoogleVertexProvider,
  extraMapping?: Record<ModelId, string>,
) => {
  // Deferred so incomplete settings surface at model construction, not at wrap time.
  let maas: GoogleVertexMaasProvider | undefined;

  const base = withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
      normalizeDelimiters: ["anthropic"],
    },
  });

  return customProvider({
    languageModels: {
      get "google/gemma-4-26b-a4b"() {
        maas ??= createMaas(provider);
        return maas.languageModel("google/gemma-4-26b-a4b-it-maas");
      },
    },
    fallbackProvider: base,
  });
};
