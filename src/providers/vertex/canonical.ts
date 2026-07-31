import type { GoogleVertexProvider } from "@ai-sdk/google-vertex";
import {
  createVertexMaas,
  type GoogleVertexMaasProviderSettings,
} from "@ai-sdk/google-vertex/maas";
import { customProvider } from "ai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b-instruct-2507-maas",
  "deepseek/deepseek-v3.2": "deepseek-v3.2-maas",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

type VertexHeaders = Record<string, string | undefined>;

type ResolvableHeaders =
  | VertexHeaders
  | PromiseLike<VertexHeaders>
  | (() => VertexHeaders | PromiseLike<VertexHeaders>);

/**
 * Internal config the AI SDK attaches to every Vertex model. `createVertex` keeps
 * `project` and `googleAuthOptions` in a closure, so the resolved base URL, auth
 * headers, and fetch are only reachable through a model instance.
 */
type VertexModelConfig = {
  baseURL?: string;
  headers?: ResolvableHeaders;
  fetch?: GoogleVertexMaasProviderSettings["fetch"];
};

const VERTEX_PROJECT_PATH = /\/projects\/([^/]+)\//u;

const readModelConfig = (provider: GoogleVertexProvider): VertexModelConfig => {
  try {
    // Any model id works: constructing a model issues no request, it only
    // resolves the provider settings we need.
    const { config } = provider.languageModel("gemini-2.5-flash") as unknown as {
      config?: VertexModelConfig;
    };
    return config ?? {};
  } catch {
    // Settings are incomplete (e.g. missing project); fall back to MaaS defaults.
    return {};
  }
};

// Gemma thinking is not exposed via generateContent, so it routes through the
// MaaS endpoint, which serves Gemma only from the global endpoint.
const createMaas = (provider: GoogleVertexProvider) => {
  const config = readModelConfig(provider);
  const project = config.baseURL?.match(VERTEX_PROJECT_PATH)?.[1];

  // Express mode (API key) resolves no project into its base URL, and MaaS
  // rejects API keys anyway, so keep the MaaS defaults (env vars + ADC).
  if (!project) return createVertexMaas({ location: "global" });

  const baseFetch = config.fetch;

  // MaaS mints its own token and always wins over its `headers` option, so the
  // provider's headers are applied here instead. Without this, MaaS would
  // authenticate with ambient Application Default Credentials.
  const fetchWithVertexAuth = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const resolve = config.headers;
    const vertexHeaders = (typeof resolve === "function" ? await resolve() : await resolve) ?? {};

    const headers = new Headers(init?.headers);
    for (const [key, value] of Object.entries(vertexHeaders)) {
      if (value !== undefined) headers.set(key, value);
    }

    return (baseFetch ?? globalThis.fetch)(input, { ...init, headers });
  }) as typeof fetch;

  return createVertexMaas({
    project,
    location: "global",
    fetch: fetchWithVertexAuth,
    // Short-circuits the ADC lookup that would otherwise run before `fetch`;
    // the placeholder token is overwritten by the provider's `Authorization`.
    googleAuthOptions: {
      projectId: project,
      authClient: { getAccessToken: () => Promise.resolve({ token: null }) },
    } as unknown as GoogleVertexMaasProviderSettings["googleAuthOptions"],
  });
};

export const withCanonicalIdsForVertex = (
  provider: GoogleVertexProvider,
  extraMapping?: Record<ModelId, string>,
) => {
  let maas: ReturnType<typeof createMaas> | undefined;

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
