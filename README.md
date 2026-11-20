# Hebo Gateway

Roll your own AI gateway for full control over models, providers, routing logic, guardrails, observability and more ...

## 🐒 Overview

Existing AI gateways like OpenRouter, Vercel AI Gateway, LiteLLM, and Portkey work out of the box, but they’re hard to extend once your needs go beyond configuration.

Hebo Gateway is an open-source, embeddable AI gateway framework built to live inside your app. It gives you full control over providers, models, routing, and the request lifecycle.

Learn more in our blog post: [Yet Another AI Gateway?](https://hebo.ai/blog/260127-hebo-gateway/) (`https://hebo.ai/blog/260127-hebo-gateway/`)

## 🍌 Features

- 🌐 OpenAI-compatible `/chat/completions`, `/embeddings`, `/audio/transcriptions` & `/models` endpoints.
- 💬 Open Responses `/responses` endpoint (stateless), including /conversations.
- 🗨️ Anthropic-compatible `/messages` endpoint.
- 🔌 Integrate into your existing Hono, Elysia, Next.js & TanStack apps.
- 🧩 Provider registry compatible with any Vercel AI SDK providers.
- 🧭 Canonical model IDs and parameter naming across providers.
- 🗂️ Model catalog sourced from models.dev on startup: new models need no gateway release.
- 🪝 Hook system to customize routing, auth, rate limits, and shape responses.
- 👁️ Observability via OTel GenAI semantic conventions (Langfuse-compatible).
- 🧰 Low-level OpenAI-compatible schema, converters, and middleware helpers.

## 📦 Installation

```bash
bun install @hebo-ai/gateway
```

## ☰ Table of Contents

- Quickstart
  - [Setup A Gateway Instance](#setup-a-gateway-instance) | [Mount Route Handlers](#mount-route-handlers) | [Call the Gateway](#call-the-gateway)
- Configuration Reference
  - [Providers](#providers) | [Models](#models) | [Hooks](#hooks) | [Storage](#storage) | [Logger](#logger-settings) | [Observability](#observability) | [Advanced](#advanced-settings)
- Framework Support
  - [ElysiaJS](#elysiajs) | [Hono](#hono) | [Next.js](#nextjs) | [TanStack Start](#tanstack-start)
- Runtime Support
  - [Vercel Edge](#vercel-edge) | [Cloudflare Workers](#cloudflare-workers) | [Deno Deploy](#deno-deploy) | [AWS Lambda](#aws-lambda)
- Endpoints
  - [/chat/completions](#chatcompletions) | [/embeddings](#embeddings) | [/audio/transcriptions](#audiotranscriptions) | [/models](#models) | [/responses](#responses) | [/messages](#messages) | [/conversations](#conversations)
- OpenAI Extensions
  - [Reasoning](#reasoning) | [Service Tier](#service-tier) | [Prompt Caching](#prompt-caching) | [Compressed Requests](#compressed-requests)
- Advanced Usage
  - [Passing Framework State to Hooks](#passing-framework-state-to-hooks) | [Selective Route Mounting](#selective-route-mounting) | [Low-level Schemas & Converters](#low-level-schemas--converters)

## 🚀 Quickstart

### Setup A Gateway Instance

Start by creating a gateway instance with at least one provider and a few models.

```ts
import { createGroq } from "@ai-sdk/groq";
import { gateway, defineModelCatalog } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";

export const gw = gateway({
  // PROVIDER REGISTRY
  providers: {
    // Any Vercel AI SDK provider + withCanonicalIdsForX helper
    groq: withCanonicalIdsForGroq(
      createGroq({
        apiKey: process.env.GROQ_API_KEY,
      }),
    ),
  },

  // MODEL CATALOG
  models: defineModelCatalog(
    // Pick a single model
    "openai/gpt-oss-20b",
    // Or a whole model family
    gptOss["all"],
  ),
});
```

> [!TIP]
> Why `withCanonicalIdsForX`? In most cases you want your gateway to route using model IDs that are consistent across providers (e.g. `openai/gpt-oss-20b` rather than `openai.gpt-oss-20b-v1:0`). We call that `Canonical IDs` - they are what enable routing, fallbacks, and policy rules. Without this wrapper, providers only understands their native IDs, which would make cross-provider routing impossible.

### Mount Route Handlers

Hebo Gateway plugs into your favorite web framework. Simply mount the gateway’s `handler` under a prefix, and keep using your existing lifecycle hooks for authentication, logging, observability, and more.

Here is an example using **ElysiaJS** (our favorite):

`src/index.ts`

```ts
import { Elysia } from "elysia";

// Previously created gateway instance
const gw = gateway({
  /// ...
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
```

See [Framework Support](#-framework-support) for all supported framework examples.

### Call the Gateway

Since Hebo Gateway exposes OpenAI-compatible and Anthropic-compatible endpoints, it can be used with a broad set of common AI SDKs like **Vercel AI SDK**, **TanStack AI**, **LangChain**, the official **OpenAI SDK**, the official **Anthropic SDK**, and others.

Here is a quick example using the Vercel AI SDK against the OpenAI-compatible surface:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const hebo = createOpenAICompatible({
  name: "hebo",
  baseURL: "http://localhost:3000/v1/gateway",
});

const { text } = await generateText({
  // Notice how this is using 'openai/gpt-oss-20b' instead of 'gpt-oss-20b'
  // The gateway automatically maps modelIDs to the upstream provider ones
  model: hebo("openai/gpt-oss-20b"),
  prompt: "Tell me a joke about monkeys",
});

console.log(text);
```

## ⚙️ Configuration Reference

### Providers

For most setups, start with one of the built-in canonical provider adapters. They wrap a provider SDK and let the gateway route using stable canonical model IDs like `openai/gpt-4.1-mini` instead of provider-native IDs.

Built-in adapters are available for `Alibaba`, `Anthropic`, `Azure`, `Bedrock`, `Chutes`, `Cohere`, `DeepInfra`, `DeepSeek`, `Fireworks`, `Groq`, `MiniMax`, `Moonshot`, `OpenAI`, `Together AI`, `Vertex`, `Voyage`, `xAI`, and `Z.ai`.

Import the helper from the matching package path:

```ts
// pattern: @hebo-ai/gateway/providers/<provider>
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
```

If you need a provider that is not on that list, Hebo Gateway’s provider registry also accepts any **Vercel AI SDK Provider**.

Provider-native IDs come from the [model catalog](#models): models.dev lists each model under the native ID every provider serves it with, so a new model works on all of its providers without a gateway release. Adapters only add the rules that apply to a whole provider (Bedrock inference profiles and Mantle, Vertex MaaS). IDs the catalog does not know fall back to the canonical ID without its namespace. Pass an extra mapping to override either:

```ts
const deepinfra = withCanonicalIdsForDeepInfra(createDeepInfra(), {
  "moonshotai/kimi-k3.1-pro": "moonshotai/Kimi-K3.1-Pro",
});
```

`withCanonicalIdsForBedrock` nests two further Bedrock endpoints. Claude models resolve through [`InvokeModel`](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html), which takes the Anthropic request shape verbatim — mid-conversation `system` turns (what Claude Code sends), `anthropic_beta` features and native `cache_control` are all unavailable on Converse. It inherits the base URL, custom headers **and** credentials of the wrapped provider, because `InvokeModel` signs for the same service and host as Converse, so no extra configuration is needed. Pass `anthropic` settings to override any of that, or `anthropic: false` to keep Claude on Converse. A forwarded `anthropic-beta` header is filtered to the [betas Bedrock implements](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html), since Bedrock rejects the first-party-only ones Claude Code sends by default; the betas a request actually needs are still added by the provider.

```ts
const bedrock = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }), {
  // optional: Claude is served from InvokeModel by default
  anthropic: { region: "us-west-2" },
});
```

It additionally nests Bedrock’s OpenAI-compatible [Mantle](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-mantle.html) endpoint, so the models models.dev only lists there (e.g. GPT-5.x) resolve through it while everything else keeps using Converse. Mantle is available in [fewer regions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-mantle.html) than `bedrock-runtime`, so set `mantle.region` when the wrapped provider points somewhere Mantle does not serve. Mantle inherits the wrapped provider’s region and custom headers, but not its credentials: those never leave the `createAmazonBedrock` closure, and its request signing is bound to the `bedrock` service while Mantle requires `bedrock-mantle`. By default Mantle therefore reads the ambient AWS environment (`AWS_BEARER_TOKEN_BEDROCK`, or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`), which needs no configuration at all. To pass credentials explicitly, declare them once and hand them to both:

```ts
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { withCanonicalIdsForBedrock } from "@hebo-ai/gateway/providers/bedrock";

const settings = { region: "us-east-1", apiKey: process.env["BEDROCK_API_KEY"] };

const bedrock = withCanonicalIdsForBedrock(createAmazonBedrock(settings), { mantle: settings });
```

For Azure, the native ID is the deployment name: the model name models.dev lists, e.g. `openai/gpt-5.6-luna` uses the Azure deployment `gpt-5.6-luna`. Pass an extra mapping as the second argument when your deployment has a custom name.

```ts
import { createAzure } from "@ai-sdk/azure";
import { withCanonicalIdsForAzure } from "@hebo-ai/gateway/providers/azure";

const azure = withCanonicalIdsForAzure(createAzure({ resourceName: "my-resource" }));
```

For custom provider setups, wrap the provider instance with `withCanonicalIds` and define your own canonicalization mapping and rules:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineModelCatalog, gateway, withCanonicalIds } from "@hebo-ai/gateway";

const myProvider = withCanonicalIds(
  createOpenAICompatible({
    name: "my-provider",
    baseURL: "https://api.my-provider.com/v1",
    apiKey: process.env["MY_PROVIDER_API_KEY"],
  }),
  {
    mapping: {
      "openai/gpt-4.1-mini": "gpt-4.1-mini-custom",
      "anthropic/claude-sonnet-4-6": "claude-sonnet-4-6",
    },
  },
);

const gw = gateway({
  providers: {
    myProvider,
  },
  models: defineModelCatalog({
    // ...your own models, served by the custom provider
    "acme/support-bot": { name: "Support Bot", providers: ["myProvider"] },
  }),
});
```

### Models

The model catalog comes from [models.dev](https://models.dev). The gateway loads `https://models.dev/api.json` once, on the first request, and falls back to the models.dev snapshot bundled with the installed release if that fails (or times out after 5 seconds). New models therefore show up without upgrading the gateway.

Models are keyed by their canonical models.dev lab ID (`<lab>/<model>`, e.g. `anthropic/claude-sonnet-4-6`, `moonshotai/kimi-k3`, `zhipuai/glm-5.3`). Each one lists the configured providers that serve it; the first one serves the request. How each provider serves a model stays internal: the catalog hands the native ID, output limit and reasoning controls models.dev lists to the providers wrapped with `withCanonicalIds`, and model middleware is built from them (see [Model Middleware](#model-middleware)). Every instance of a `withCanonicalIdsFor*` wrapper shares them, so providers created per request (e.g. BYOK providers returned by a `resolveProvider` hook) resolve the same native IDs as the configured ones.

#### Model Families

Hebo Gateway ships one module per lab under `@hebo-ai/gateway/models/<lab>`. Importing it registers the lab: its models become part of the catalog, and its model middleware applies to them. Models of labs you do not import are left out.

Each module also exports the lab's model families (e.g. `claude`, `gemini`, `llama`), which group its models:

- `all`: every model of the family, named groups included (e.g. embedding and transcription models).
- `latest`: the newest stable release of each product line (e.g. Claude Opus, Sonnet, Haiku and Fable).
- `vX` / `vX.Y`: one version (e.g. `claude["v4.6"]`), `vX.x`: one major version (e.g. `claude["v5.x"]`).
- Named groups, e.g. `claude.opus`, `gpt.codex`, `gemini.embeddings`.

```ts
import { defineModelCatalog } from "@hebo-ai/gateway";
import { claude } from "@hebo-ai/gateway/models/anthropic";
import { gpt } from "@hebo-ai/gateway/models/openai";

const models = defineModelCatalog(
  // A family group
  claude["latest"],
  // The same, served only by Bedrock (`providers` narrows and reorders, other fields replace)
  claude["v5.x"]({ providers: ["bedrock"] }),
  // Single models (IDs of imported labs autocomplete), or `*` patterns
  "openai/gpt-6-sol",
  "openai/gpt-oss-*",
);
```

Groups are resolved when the catalog loads, so a new release joins `all`, `latest` and its version groups without a gateway release. This also means `latest` can change on restart: list exact IDs to pin the catalog. When `models` is omitted, every model of the imported labs is exposed.

Out-of-the-box model families:

- **Alibaba** — `@hebo-ai/gateway/models/alibaba`: `qwen` (`embeddings`)
- **Amazon** — `@hebo-ai/gateway/models/amazon`: `nova` (`embeddings`)
- **Anthropic** — `@hebo-ai/gateway/models/anthropic`: `claude` (`opus`, `sonnet`, `haiku`, `fable`)
- **Cohere** — `@hebo-ai/gateway/models/cohere`: `command` (`A`, `R`), `embed`, `north`
- **DeepSeek** — `@hebo-ai/gateway/models/deepseek`: `deepseek`
- **Google** — `@hebo-ai/gateway/models/google`: `gemini` (`preview`, `embeddings`, `transcription`), `gemma`
- **Meta** — `@hebo-ai/gateway/models/meta`: `llama`
- **Microsoft** — `@hebo-ai/gateway/models/microsoft`: `maiTranscribe`
- **MiniMax** — `@hebo-ai/gateway/models/minimax`: `minimax`
- **Moonshot** — `@hebo-ai/gateway/models/moonshot`: `kimi` (version groups use `k`, e.g. `kimi["k3.x"]`)
- **OpenAI** — `@hebo-ai/gateway/models/openai`: `gpt` (`codex`, `pro`, `transcription`), `gptOss`, `textEmbeddings`
- **Voyage** — `@hebo-ai/gateway/models/voyage`: `voyage`
- **xAI** — `@hebo-ai/gateway/models/xai`: `grok` (`transcription`)
- **Z.ai** — `@hebo-ai/gateway/models/zai`: `glm`

All of them also have `all`, `latest` and version groups.

#### User-defined Models

Until models.dev lists a model, add it yourself by following the `CatalogModel` type. Custom models only fill gaps: once models.dev lists the same ID, its entry is used instead.

```ts
const models = defineModelCatalog(claude["latest"], {
  "anthropic/claude-opus-6": {
    name: "Claude Opus 6",
    family: "claude-opus",
    created: "2027-01-10",
    knowledge: "2026-09",
    modalities: {
      input: ["text", "image", "file"],
      output: ["text"],
    },
    context: 1000000,
    capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
    // Providers serving the model, in routing order
    providers: ["anthropic", "bedrock"],
    // Additional properties are merged into the model object
    additionalProperties: {
      customProperty: "customValue",
    },
  },
});
```

> [!NOTE]
> The only mandatory property is `providers`, everything else is optional metadata. Custom models are visible to the family groups in the same `defineModelCatalog` call: the example above makes Claude Opus 6 part of `claude["latest"]`.
>
> Providers resolve the native ID of a custom model like any ID the catalog does not know, through the adapter's fallback rule: usually the canonical ID without its namespace (`claude-opus-6`), on Bedrock `us.anthropic.claude-opus-6-v1:0`. When a provider serves it under a different ID, pass that ID in the adapter's extra mapping, e.g. `withCanonicalIdsForBedrock(bedrock, { extraMapping: { "anthropic/claude-opus-6": "{ip}anthropic.claude-opus-6" } })`.

#### Catalog Source

```ts
const gw = gateway({
  providers: {
    // ...
  },
  advanced: {
    catalog: {
      // Any URL serving the models.dev `api.json` shape works (default: "https://models.dev/api.json").
      // `false` only uses the snapshots bundled with the release.
      source: false,
      // Timeout for loading `source`, in milliseconds (default: 5000).
      timeout: 5000,
    },
  },
});
```

> [!TIP]
> On runtimes with tight per-request CPU limits (e.g. Cloudflare Workers free plan), parsing the full models.dev catalog on the first request can be too expensive. Use `source: false`, or point `source` at a smaller, self-hosted copy.

The bundled snapshots live in `src/models/<lab>/models-dev.json` and are refreshed with `bun run models:sync` before every release.

#### Model Middleware

Each lab module registers middleware for all of its models (e.g. `anthropic/claude-*`), which maps the gateway's provider-agnostic params (reasoning, prompt caching, dimensions, …) to the lab's API. What differs per model and provider comes from models.dev, not from model IDs: the effort levels a model takes, whether reasoning can be turned off, whether it takes a thinking budget, and its output limit. A new model therefore gets the right mapping on restart, without a gateway release. Models without that data (e.g. user-defined ones) are treated like the lab's current generation.

Custom middleware can read the same data with `specOf(model)`, for the `model` it is given:

```ts
import {
  modelMiddlewareMatcher,
  reasoningControls,
  resolveReasoning,
  specOf,
  takeReasoning,
} from "@hebo-ai/gateway";
import type { LanguageModelMiddleware } from "ai";

const acmeReasoning: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params, model }) => {
    const reasoning = takeReasoning(params);
    const spec = specOf(model);
    // The model's controls, or these when models.dev has none. `undefined`: it takes none.
    const controls = reasoningControls(spec, { effort: ["low", "high"] });
    if (!reasoning || !controls) return params;

    const resolved = resolveReasoning(reasoning, controls, spec.output);
    if (resolved?.effort) (params.providerOptions!["acme"] ??= {})["effort"] = resolved.effort;
    return params;
  },
};

modelMiddlewareMatcher.useForModel("acme/*", { language: [acmeReasoning] });
```

> [!NOTE]
> Claude 4.5 models are not part of the catalog: unlike every later Claude model, they can't think adaptively.

The sync script lists every change to the reasoning controls of a bundled model, so upstream data changes show up in review.

### Hooks

Hooks allow you to plug into the lifecycle of the gateway and enrich it with additional functionality, like your actual routing logic. All hooks are available as async and non-async.

```ts
const gw = gateway({
  providers: {
    // ...
  },
  models: {
    // ...
  },
  hooks: {
    /**
     * Runs before any endpoint handler logic.
     * @param ctx.request Incoming request.
     * @returns Optional Response to short-circuit the request.
     */
    onRequest: async (ctx: { request: Request }): Promise<Response | void> => {
      // Example Use Cases:
      // - Verify authentication
      // - Enforce rate limits
      return undefined;
    },
    /**
     * Runs after body is parsed & validated.
     * @param ctx.body Parsed request body.
     * @returns Replacement parsed body, or undefined to keep original body unchanged.
     */
    before: async (ctx: {
      body: ChatCompletionsBody | EmbeddingsBody | TranscriptionsBody;
      operation: "chat" | "embeddings" | "transcriptions";
    }): Promise<ChatCompletionsBody | EmbeddingsBody | TranscriptionsBody | void> => {
      // Example Use Cases:
      // - Transform request body
      // - Observability integration
      return undefined;
    },
    /**
     * Maps a user-provided model ID or alias to a canonical ID.
     * @param ctx.body The parsed body object with all call parameters.
     * @param ctx.modelId Incoming model ID.
     * @returns Canonical model ID or undefined to keep original.
     */
    resolveModelId: async (ctx: {
      body: ChatCompletionsBody | EmbeddingsBody | TranscriptionsBody;
      modelId: ModelId;
    }): Promise<ModelId | void> => {
      // Example Use Cases:
      // - Resolve modelAlias to modelId
      return undefined;
    },
    /**
     * Picks a provider instance for the request.
     * @param ctx.providers ProviderRegistry from config.
     * @param ctx.models ModelCatalog from config.
     * @param ctx.body The parsed body object with all call parameters.
     * @param ctx.resolvedModelId Resolved model ID.
     * @param ctx.operation Operation type ("chat" | "embeddings" | "transcriptions").
     * @returns ProviderV4 to override, or undefined to use default.
     */
    resolveProvider: async (ctx: {
      providers: ProviderRegistry;
      models: ModelCatalog;
      body: ChatCompletionsBody | EmbeddingsBody | TranscriptionsBody;
      resolvedModelId: ModelId;
      operation: "chat" | "embeddings" | "transcriptions";
    }): Promise<ProviderV4 | void> => {
      // Example Use Cases:
      // - Routing logic between providers
      // - Bring-your-own-key authentication
      return undefined;
    },
    /**
     * Runs after the endpoint handler.
     * @param ctx.result Result object returned by the handler.
     * @returns Modified result, or undefined to keep original.
     */
    after: async (ctx: {
      result: ChatCompletions | ChatCompletionsStream | Embeddings | Transcriptions;
    }): Promise<ChatCompletions | ChatCompletionsStream | Embeddings | Transcriptions | void> => {
      // Example Use Cases:
      // - Transform result
      // - Result logging
      return undefined;
    },
    /**
     * Runs after the gateway has produced the final Response.
     * @param ctx.response Response object returned by the lifecycle.
     * @returns Replacement response, or undefined to keep original.
     */
    onResponse: async (ctx: { response: Response }): Promise<Response | void> => {
      // Example Use Cases:
      // - Add response headers
      // - Replace or redact response payload
      return undefined;
    },
    /**
     * Runs when the lifecycle catches an error.
     * @param ctx.error The thrown error.
     * @returns Replacement error response, or undefined to use the default OpenAI-compatible error response.
     */
    onError: async (ctx: { error: unknown }): Promise<Response | void> => {
      // Example Use Cases:
      // - Map internal errors to custom API responses
      // - Add app-specific logging or alerting
      return undefined;
    },
  },
});
```

The `ctx` object is **readonly for core fields**. Use return values to override request / parsed body / result / response and to provide modelId / provider instances.

> [!TIP]
> To pass data between hooks, use `ctx.state`. It’s a per-request mutable bag in which you can stash things like auth info, routing decisions, timers, or trace IDs and read them later again in any of the other hooks.

### Storage

The `/conversations` endpoint stores conversation history and associated items. By default, the gateway uses an in-memory storage, which is suitable for development but not for production as data is lost when the server restarts.

#### In-Memory Storage

You can configure the size of the in-memory storage (default is 256MB).

```ts
import { gateway } from "@hebo-ai/gateway";
import { InMemoryStorage } from "@hebo-ai/gateway/storage/memory";

const gw = gateway({
  // ...
  storage: new InMemoryStorage({
    maxSize: 512 * 1024 * 1024, // 512MB
  }),
});
```

#### SQL Storage

Hebo Gateway provides high-performance SQL adapters for **PostgreSQL**, **SQLite**, **MySQL**, and **GrepTimeDB**. It supports common drivers like `pg`, `postgres.js`, `mysql2`, `better-sqlite3`, `@libsql/client`, and `Bun.SQL`.

```ts
import { gateway } from "@hebo-ai/gateway";
import { SqlStorage, PostgresDialect } from "@hebo-ai/gateway/storage/sql";
import { Pool } from "pg";

// 1. Setup dialect-specific client (e.g. pg, mysql2, sqlite, bun)
const client = new Pool({ connectionString: process.env.DATABASE_URL });

// 2. Setup storage with matching dialect (PostgresDialect, SqliteDialect, MysqlDialect, ...)
const storage = new SqlStorage({
  dialect: new PostgresDialect({ client }),
});

// 3. Run migrations
await storage.migrate();

const gw = gateway({ storage });
```

> [!TIP]
> The `PostgresDialect` includes optimized `JSONB` storage and high-performance `BRIN` indexing for time-ordered data by default.

## 🧩 Framework Support

Hebo Gateway exposes **WinterCG-compatible** handlers that integrate with almost any existing framework.

### ElysiaJS

`src/index.ts`

```ts
import { Elysia } from "elysia";

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
```

### Hono

`src/index.ts`

```ts
import { Hono } from "hono";

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
```

### Next.js

#### App Router

`app/api/gateway/[...all]/route.ts`

```ts
const gw = gateway({
  // Required: add `basePath` to your gateway config
  basePath: "/api/gateway",
  // ...
});

export const POST = gw.handler,
  GET = gw.handler;
```

#### Pages Router

`pages/api/gateway/[...all].ts`

```ts
// Requires `@mjackson/node-fetch-server` npm package
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

const gw = gateway({
  // Required: add `basePath` to your gateway config
  basePath: "/api/gateway",
  // ...
});

export default async function handler(req, res) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
```

### TanStack Start

`routes/api/$.ts`

```ts
const gw = gateway({
  // Required: add `basePath` to your gateway config
  basePath: "/api/gateway",
  // ...
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
```

## 🌍 Runtime Support

Hebo Gateway also works directly with runtime-level `Request -> Response` handlers.

### Vercel Edge

`api/gateway.ts`

```ts
export const runtime = "edge";

const gw = gateway({
  // ...
});

export default gw.handler;
```

### Cloudflare Workers

`src/index.ts`

```ts
const gw = gateway({
  // ...
});

export default {
  fetch: gw.handler,
};
```

### Deno Deploy

`main.ts`

```ts
import { serve } from "https://deno.land/std/http/server.ts";

const gw = gateway({
  // ...
});

serve((request: Request) => gw.handler(request));
```

### AWS Lambda

`src/lambda.ts`

```ts
import { awsLambdaEventHandler } from "@hattip/adapter-aws-lambda";

const gw = gateway({
  // ...
});

export const handler = awsLambdaEventHandler({
  handler: gw.handler,
});
```

## 🚀 Endpoints

Hebo Gateway provides OpenAI-, OpenResponses- and Anthropic-compatible endpoints.

### `/chat/completions`

The primary endpoint for generating chat completions.

Official documentation: [OpenAI API Reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

It supports:

- Streaming responses (Server-Sent Events).
- Tool calling / Function calling.
- Advanced extensions like [Reasoning](#reasoning), [Service Tier](#service-tier), and [Prompt Caching](#prompt-caching).
- Usage tracking and metadata.

> [!IMPORTANT]
> **Compatibility & Roadmap:**
> We are actively working to expand support for the full OpenAI spec:

- **`logprobs` / `top_logprobs`**: Token-level logprobs.
- **`logit_bias`**: Logit bias in the request body.
- **`n` > 1**: Multi-choice completions.

### `/embeddings`

Generates vector representations for text inputs, compatible with OpenAI's embeddings API.

Official documentation: [OpenAI API Reference](https://developers.openai.com/api/reference/resources/embeddings/methods/create)

It supports:

- Text and token array inputs.
- Custom dimensions (for `v3` models).
- Standard `float` and `base64` encoding formats.

> [!IMPORTANT]
> **Compatibility & Roadmap:**

- **`encoding_format`**: `base64` results.

### `/audio/transcriptions`

Transcribes audio into text, compatible with OpenAI's and OpenRouter's transcription APIs.

Official documentation: [OpenAI API Reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create) | [OpenRouter API Reference](https://openrouter.ai/docs/api/api-reference/stt/create-transcription)

It supports:

- OpenAI-style `multipart/form-data` uploads (`file`) and OpenRouter-style JSON with base64 `input_audio: { data, format }`.
- `language`, `prompt`, `temperature` and `timestamp_granularities`, mapped to each model's native options by transcription middleware. Params a model doesn't support are forwarded unchanged, so the upstream provider decides whether to ignore or reject them. Custom mappings can be registered via `modelMiddlewareMatcher.useForModel` / `useForProvider` with a `transcription` entry.
- `response_format`: `json` (default) returns `{ text, usage }`; `verbose_json` adds `task`, `language`, `duration`, timestamped `segments` and, for providers that return word timings (xAI, Vertex Gemini with `timestamp_granularities: ["word"]`), OpenAI-style `words: [{ word, start, end }]`. Built from the AI SDK's normalized result; word-level providers return an empty `segments` array rather than one segment per word.
- Provider-specific params (e.g. `diarize`, `keyterm`, `chunking_strategy`) are forwarded as provider options, like on the other endpoints.
- Flat usage: `input_tokens`, `output_tokens`, `total_tokens` and `seconds`, filled in with whatever the provider reports (falling back to the audio duration).
- Transcription middleware for OpenAI (`openai/gpt-transcribe`), xAI (`xai/grok-voice-transcribe-2.0`), Vertex (`google/gemini-3.5-transcribe`) and Azure Speech (`microsoft/mai-transcribe-2`).

```ts
import fs from "node:fs";

import OpenAI from "openai";

const client = new OpenAI({ baseURL: "http://localhost:3000/v1/gateway", apiKey: "..." });

const { text, usage } = await client.audio.transcriptions.create({
  model: "openai/gpt-transcribe",
  file: fs.createReadStream("meeting.mp3"),
});
```

Transcription models use `modalities: { input: ["audio"], output: ["transcription"] }` in the catalog. `advanced.maxBodySize` (default 10 MB) is enforced on all transcription request bodies, including plain multipart and JSON uploads; raise it for longer recordings (base64 adds ~33%).

> [!IMPORTANT]
> **Compatibility & Roadmap:**

- **`response_format`**: `text`, `srt` and `vtt` (rejected with `400`).
- **`stream`**: Streaming transcription (rejected with `400`).
- **URL input**: `input_audio.url` / `source_url`.
- **GPT Transcribe hints**: `languages` and `keywords` are not forwarded yet (the AI SDK's OpenAI provider drops them); `language` and `prompt` work. Only `json` output is returned, so `verbose_json` has no segments.
- **Retries**: Upstream calls are not retried (other endpoints retry twice via the AI SDK), so large uploads are never re-sent automatically. Retry on the client if needed.

### `/models`

Lists all available models in your [Model Catalog](#models), including their capabilities and metadata.

Official documentation: [OpenAI API Reference](https://developers.openai.com/api/reference/resources/models/methods/list)

It supports:

- Comprehensive model metadata (capabilities, context limits, knowledge cutoffs).
- Canonical model ID resolution.
- Provider-specific availability filtering.

### `/responses`

Hebo Gateway provides a `/responses` endpoint implementing the [Open Responses API](https://www.openresponses.org/reference).

Official documentation: [Open Responses API Reference](https://www.openresponses.org/reference)

It supports:

- The same models, providers, hooks, and extensions as `/chat/completions`.
- Responses API request/response format.
- Tool calling and multimodal inputs.
- Normalized reasoning and thought signatures.

> [!IMPORTANT]
> **Compatibility & Roadmap:**
> We are working towards full Open Responses parity:

- **Persistence**: Server-side response storage (`store`), background orchestration (`background`), and chaining via `previous_response_id`.
- **`conversation`**: Directly passing conversation IDs for automatic context management.
- **`context_management`**: Support for automatic compaction strategies.
- **`prompt`**: Reusable prompt templates with variables.
- **`phase`**: Support for `commentary` vs `final_answer` reasoning phases.
- **`safety_identifier`**: Custom safety and moderation policies.
- **`truncation`**: Context window management strategies.
- **`text.verbosity`**: Control over response detail (low/medium/high).
- **`logprobs` / `top_logprobs`**: Token-level logprobs.
- **`include`**: Selective response fields (e.g., `logprobs`, `reasoning.encrypted_content`, and tool-specific outputs).
- **`stream_options.include_obfuscation`**: Normalizing payload sizes to mitigate side-channel attacks.

### `/messages`

Hebo Gateway provides a `/messages` endpoint compatible with the [Anthropic Messages API](https://docs.anthropic.com/en/api/messages).

Official documentation: [Anthropic Messages API Reference](https://docs.anthropic.com/en/api/messages)

It supports:

- The same models, providers, hooks, and extensions as `/chat/completions`.
- Anthropic Messages API request/response format.
- Streaming responses.
- Tool use and multimodal inputs.

### `/conversations`

Hebo Gateway provides a dedicated `/conversations` endpoint for managing persistent conversation state. It is designed as an extension of the [OpenAI Conversations API](https://developers.openai.com/api/reference/resources/conversations/methods/create) and supports standard CRUD operations alongside advanced listing with metadata filtering.

Official documentation: [OpenAI Conversations API](https://developers.openai.com/api/reference/resources/conversations/methods/create)

#### List & Filter Conversations (Hebo Extension)

Since standard OpenAI APIs (like Threads) do not support global listing of conversations, Hebo Gateway provides this capability as an extension. You can list all conversations using cursor-based pagination and filter by any metadata key using the `metadata.KEY=VALUE` pattern.

```bash
# List conversations for a specific user using metadata filtering
curl "https://api.gateway.com/conversations?limit=10&metadata.user_id=123"
```

The response follows the standard OpenAI list object:

```json
{
  "object": "list",
  "data": [
    {
      "id": "conv_abc123",
      "object": "conversation",
      "created_at": 1678531200,
      "metadata": { "user_id": "123" }
    }
  ],
  "first_id": "conv_abc123",
  "last_id": "conv_abc123",
  "has_more": false
}
```

## 🧠 OpenAI Extensions

### Reasoning

In addition to the official `reasoning_effort` parameter, the chat completions endpoint accepts a `reasoning` object for more fine-grained control of the budget. It's treated as provider-agnostic input and normalized before hitting the upstream model.

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "messages": [{ "role": "user", "content": "Explain the tradeoffs." }],
  "reasoning": { "effort": "medium" }
}
```

Normalization rules:

- `enabled` -> fall-back to model default if none provided
- `max_tokens`: fall-back to model default if model supports
- `effort` supports: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`
- `effort` -> the nearest level the model takes (per models.dev), ties going up, e.g. `xhigh` -> `max` on Claude Opus 4.6
- Off (`enabled: false` or `effort: "none"`) -> the model's reasoning toggle, else its `none` level, else its lowest level for models that always reason
- Generic `effort` -> budget = percentage of `max_tokens`, for models that take a budget
  - `none`: 0%
  - `minimal`: 10%
  - `low`: 20%
  - `medium`: 50% (default)
  - `high`: 80%
  - `xhigh`: 95%
  - `max`: 100%

Reasoning output is surfaced as extension to the `completion` object.

- When present, it is returned on the assistant message as `reasoning_content`. Reasoning token counts (when available) are returned on `usage.completion_tokens_details.reasoning_tokens`.
- For stream responses, reasoning text is sent incrementally as `reasoning_content` part (separate from normal text `content` deltas). Token counts land in the final `usage` object on the terminating chunk.

Most SDKs handle these fields out-of-the-box.

#### Thinking Blocks & Context Preservation

Advanced models (like Anthropic Claude 3.7 or Gemini 3) surface structured reasoning steps and signatures that act as a "save state" for the model's internal reasoning process. To maintain this context across multi-turn conversations and tool-calling workflows, you should pass back the following extensions in subsequent messages:

- **reasoning_details**: Standardized array of reasoning steps and signatures.
- **extra_content**: Provider-specific extensions, such as **Google's thought signatures** on Vertex AI.

On `/chat/completions`, `reasoning_details` follows the convention used by OpenRouter and the Vercel AI Gateway, so most OpenAI-compatible clients round-trip it without any changes. Each entry is tagged with the `format` of the provider that produced it — `anthropic-claude-v1`, `google-gemini-v1`, `openai-responses-v1`, `azure-openai-responses-v1` or `xai-responses-v1` — and carries the opaque state in the field that convention uses:

| Provider         | Opaque state                          | How it is surfaced                                                                                                           |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Anthropic Claude | thinking signature, redacted thinking | `reasoning.text` + `signature`, `reasoning.encrypted` + `data`                                                               |
| Google Gemini    | thought signature                     | `reasoning.encrypted` + `data`, `id` = the `tool_calls[].id` it belongs to; also `extra_content.vertex.thought_signature`    |
| OpenAI GPT       | encrypted reasoning trace             | `reasoning.encrypted` + `data`, `id` = the reasoning item id, alongside the `reasoning.text` summary entry sharing that `id` |

Echo the array back on the assistant message and the gateway restores the provider state, matching entries by `id`.

For **Gemini 3 and 4** models, returning the thought signature is mandatory to resume the chain-of-thought; failing to do so may result in errors or degraded performance. The gateway exposes it in two interchangeable ways and you only need to echo back one of them — `reasoning_details`, or the Vertex-specific `extra_content.vertex.thought_signature` on the tool call. When both are present, `extra_content` takes precedence.

```json
{
  "role": "assistant",
  "tool_calls": [
    { "id": "call_abc", "type": "function", "function": { "name": "bash", "arguments": "{}" } }
  ],
  "reasoning_details": [
    {
      "id": "call_abc",
      "index": 0,
      "type": "reasoning.encrypted",
      "data": "AY89a18IwQsQ8in...",
      "format": "google-gemini-v1"
    }
  ]
}
```

### Service Tier

The chat completions endpoint accepts a provider-agnostic `service_tier` extension:

- `auto`, `default`, `flex`, `priority`, `scale`

Provider-specific mapping:

- **OpenAI**: forwards as OpenAI `serviceTier` (no middleware remap).
- **Anthropic**: maps to Anthropic `serviceTier` (`default` -> `standard_only`; `auto` forwarded; `flex`/`priority`/`scale` have no equivalent and are dropped).
- **Groq**: maps to Groq `serviceTier` (`default` -> `on_demand`, `scale`/`priority` -> `performance`).
- **Google Vertex**: maps to request headers via middleware:
  - `default` -> `x-vertex-ai-llm-request-type: shared`
  - `flex` -> `x-vertex-ai-llm-request-type: shared` + `x-vertex-ai-llm-shared-request-type: flex`
  - `priority` -> `x-vertex-ai-llm-request-type: shared` + `x-vertex-ai-llm-shared-request-type: priority`
  - `scale` -> `x-vertex-ai-llm-request-type: dedicated`
- **Amazon Bedrock**: maps to Bedrock `serviceTier.type` (`default`, `flex`, `priority`, `reserved`; `scale` -> `reserved`, `auto` -> omitted/default). Claude models, served from `InvokeModel`, take the same tiers as the `x-amzn-bedrock-service-tier` request header instead.

When available, the resolved value is echoed back on response as `service_tier`.

### Prompt Caching

The chat completions endpoint supports both implicit (provider-managed) and explicit prompt caching across OpenAI-compatible providers.

Accepted request fields:

- `prompt_cache_key` + `prompt_cache_retention` (OpenAI style)
- `cache_control` (OpenRouter / Vercel / Claude style)
- `extra_body { google: { cached_content } }` (Gemini style)

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "messages": [
    {
      "role": "system",
      "content": "Reusable policy and instructions",
      "cache_control": { "type": "ephemeral", "ttl": "1h" }
    },
    { "role": "user", "content": "Apply policy to this request." }
  ]
}
```

Provider behavior:

- **OpenAI-compatible**: forwards `prompt_cache_key` and `prompt_cache_retention` as native provider options.
- **Anthropic Claude**: maps top-level caching to Anthropic cache control, while message/part `cache_control` breakpoints are preserved. Claude serves `5m` and `1h` TTLs, so OpenAI's 24h retention is clamped to `1h`. Applies on every host serving Claude, Bedrock `InvokeModel` included.
- **Google Gemini**: maps `cached_content` to Gemini `cachedContent` on Gemini 3. Gemini 4 supports implicit caching only, so no explicit cache is set.
- **Amazon Nova (Bedrock)**: maps `cache_control` to Bedrock `cachePoints` and inserts an automatic cache point on a stable prefix when none is provided.

### Compressed Requests

The gateway supports gzip and deflate compressed request bodies via the Web Compression Streams API. The [`advanced.maxBodySize`](#max-body-size) option controls the maximum _decompressed_ body size for these compressed requests, protecting against gzip bombs and oversized payloads. See [Advanced Settings](#advanced-settings) for configuration details.

## 🧪 Advanced Usage

### Logger Settings

You can configure logging via the `logger` field in the gateway config. By default, the logger uses `console` and sets the level to `debug` in non-production and `info` in production (based on the `NODE_ENV` environment variable).

```ts
import { gateway } from "@hebo-ai/gateway";

const gw = gateway({
  // ...
  logger: {
    level: "debug", // "trace" | "debug" | "info" | "warn" | "error" | "silent"
  },
});
```

If you provide a custom logger, it must implement `trace`, `debug`, `info`, `warn`, and `error` methods.

Example with **pino**:

```ts
import { gateway } from "@hebo-ai/gateway";
import pino from "pino";

const gw = gateway({
  // ...
  logger: pino({
    level: "info",
  }),
});
```

> [!TIP]
> For production workloads, we recommend `pino` for better logging performance and lower overhead.

### Observability

Hebo Gateway can forward traces & metrics via the `telemetry` config field.

```ts
import { gateway } from "@hebo-ai/gateway";
import { trace } from "@opentelemetry/api";

const gw = gateway({
  // ...
  telemetry: {
    // default: false
    enabled: true,
    // default: TraceProvider from @opentelemetry/api singleton
    tracer: trace.getTracer("my-gateway"),
    // Telemetry levels by namespace:
    // "off" | "required" | "recommended" | "full"
    signals: {
      // gen_ai.* semantic attributes
      gen_ai: "full",
      // http.*, url.*, server.* semantic attributes
      http: "recommended",
      // hebo-specific telemetry:
      // - recommended: hebo.* span events
      // - full: hebo.* span events + fetch instrumentation
      hebo: "recommended",
    },
  },
});
```

Attribute names and span & metrics semantics follow OpenTelemetry GenAI semantic conventions:
https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/
https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/

For observability integration that is not otel compliant, you can disable built-in telemetry and manually instrument requests during `before` / `after` hooks.

#### Custom Telemetry Attributes

Use `ctx.otel` in any hook to attach attributes to both spans and metrics:

```ts
hooks: {
  onRequest: (ctx) => {
    ctx.otel["app.tenant.id"] = tenantId;
    ctx.otel["app.user.id"] = userId;
  },
}
```

These attributes appear on the active span and on all metric instruments (request duration, token usage, TPOT, TTFT).

> [!TIP]
> To populate custom span attributes, the inbound W3C `baggage` header is supported. Keys in the `hebo.` namespace are mapped to span attributes, with the namespace stripped. For example: `baggage: hebo.user_id=u-123` becomes span attribute `user_id=u-123`.  
> For `/chat/completions` and `/embeddings`, request `metadata` (`Record<string, string>`, key 1-64 chars, value up to 512 chars) is also forwarded to spans as `gen_ai.request.metadata.<key>`.

#### Per-Request Trace Control

You can override the global `telemetry.signals.gen_ai` level on a per-request basis using the `trace` body parameter. This is useful for selectively enabling detailed traces on specific requests without changing the gateway-wide configuration.

The `trace` parameter is accepted on all endpoints (`/chat/completions`, `/embeddings`, `/audio/transcriptions`, `/messages`, `/responses`):

```json
{
  "model": "openai/gpt-oss-20b",
  "messages": [{ "role": "user", "content": "Hello" }],
  "trace": "full"
}
```

Accepted values:

- `false` — disables tracing for this request (equivalent to `"off"`)
- `true` — uses the global default (same as omitting the parameter)
- `"off"` | `"required"` | `"recommended"` | `"full"` — sets the signal level for this request

The resolution order is: **hook-set `ctx.trace`** > **body `trace` parameter** > **`cfg.telemetry.signals.gen_ai`**. This means hooks can always override the body parameter by setting `ctx.trace` directly:

```ts
hooks: {
  before: (ctx) => {
    // Force full tracing for a specific user
    if (ctx.state.userId === "debug-user") {
      ctx.trace = "full";
    }
  },
}
```

> [!NOTE]
> The `trace` parameter only affects span attributes and metrics signal level — it does not control whether tracing is enabled globally. The `telemetry.enabled` config field must still be `true` for any telemetry to be emitted.

#### Metrics

The Gateway also emits `gen_ai` metrics:

- `gen_ai.server.request.duration` (histogram, seconds)
- `gen_ai.server.time_per_output_token` (histogram, seconds)
- `gen_ai.server.time_to_first_token` (histogram, seconds)
- `gen_ai.client.token.usage` (histogram, tokens; tagged with `gen_ai.token.type=input|output|cached|reasoning`)

Transcription spans use `gen_ai.operation.name=transcriptions` and record the audio duration as `gen_ai.usage.audio_seconds`.

Metric names and attributes follow OpenTelemetry GenAI semantic conventions. Histogram bucket boundaries are tuned for practical dashboards and alerting rather than copied verbatim from upstream recommendations.

To capture them, configure a global `MeterProvider` before creating the gateway:

```ts
import { gateway } from "@hebo-ai/gateway";
import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

metrics.setGlobalMeterProvider(
  new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
        }),
      }),
    ],
  }),
);

const gw = gateway({
  // ...
  telemetry: {
    enabled: true,
    signals: {
      gen_ai: "recommended",
    },
  },
});
```

> [!NOTE]
> `telemetry.tracer` controls traces; metrics export is controlled by the global `MeterProvider`.

#### Langfuse

Hebo telemetry spans are OpenTelemetry-compatible, so you can send them to Langfuse via `@langfuse/otel`.

```ts
import { gateway } from "@hebo-ai/gateway";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";

context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

const gw = gateway({
  // ...
  telemetry: {
    enabled: true,
    tracer: new BasicTracerProvider({
      spanProcessors: [new LangfuseSpanProcessor()],
    }).getTracer("hebo"),
  },
});
```

Langfuse credentials are read from environment variables by the Langfuse OTel SDK (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`).

### Advanced Settings

The `advanced` field groups optional settings for timeouts, body size limits, and header forwarding.

```ts
import { gateway } from "@hebo-ai/gateway";

const gw = gateway({
  // ...
  advanced: {
    timeouts: { normal: 60_000, flex: 180_000 },
    maxBodySize: 10 * 1024 * 1024,
    forwardHeaders: ["x-my-custom-trace-id", "x-internal-team"],
  },
});
```

#### Timeouts

Controls upstream request timeouts. Accepts a number (milliseconds), `null` (disabled), or a tiered object. Default is `300_000` (5 minutes).

```ts
advanced: {
  // Single timeout for all tiers
  timeouts: 60_000,
  // ...or disable completely:
  // timeouts: null,
  // ...or split by service tier:
  // - normal: all non-flex tiers (set null to disable)
  // - flex: defaults to 3x normal when omitted (set null to disable)
  // timeouts: { normal: 30_000, flex: null },
}
```

> [!NOTE]
> **Runtime/engine timeout limits**
> Runtime-level `fetch()` clients may enforce their own timeouts. Configure those runtime/platform limits in addition to gateway `timeouts`.
>
> - Node.js runtimes use Undici: https://github.com/nodejs/undici/issues/1373 (Node.js, Vercel Serverless Functions, AWS Lambda)
> - Bun context: https://github.com/oven-sh/bun/issues/16682
>
> **Provider/service timeout limits**
> Serverless platforms (e.g. Cloudflare Workers, Vercel Edge/Serverless, AWS Lambda) also enforce platform time limits (roughly ~25-100s on edge paths, ~300s for streaming, and up to ~900s configurable for some).

#### Max Body Size

Maximum _decompressed_ request body size in bytes for gzip/deflate-encoded requests. Protects against gzip bombs and oversized payloads. Default is `10_485_760` (10 MB). Set to `0` to disable.

`/audio/transcriptions` also enforces this limit on plain (uncompressed) multipart and JSON bodies, since audio uploads are typically large.

Compressed requests that exceed this limit after decompression receive an HTTP `413 Payload Too Large` response. Unsupported `Content-Encoding` values return HTTP `415 Unsupported Media Type`.

> [!IMPORTANT]
> **Plain (uncompressed) request body size limits** are _not_ enforced by the gateway — they should be configured at the framework or server level. The gateway only enforces `maxBodySize` on decompressed output, since the framework cannot know the decompressed size ahead of time.
>
> Framework-level configuration examples:
>
> - **Bun** — [`Bun.serve({ maxRequestBodySize: 10_485_760 })`](https://bun.sh/docs/api/http#bun-serve)
> - **Elysia** — inherits from Bun's `maxRequestBodySize`
> - **Hono** — [`bodyLimit` middleware](https://hono.dev/docs/middleware/builtin/body-limit): `app.use(bodyLimit({ maxSize: 10 * 1024 * 1024 }))`
> - **Express** — [`express.json({ limit: '10mb' })`](https://expressjs.com/en/api.html#express.json)
> - **Fastify** — [`fastify({ bodyLimit: 10485760 })`](https://fastify.dev/docs/latest/Reference/Server/#bodylimit)
> - **Node.js `http`** — no built-in request-body size option; enforce a limit while reading the request stream, or use a reverse proxy like nginx (`client_max_body_size 10m`)

#### Forward Headers

Additional headers to forward to upstream providers, merged with the built-in allowlist at startup. Header names are matched case-insensitively. The merge is computed once at config parse time, not per-request.

> [!CAUTION]
> Only add non-sensitive headers. Any header listed in `advanced.forwardHeaders` is forwarded to upstream providers when present on the incoming request — avoid credentials, cookies, user tokens, or raw PII.

The gateway ships a built-in allowlist covering common provider, agent, and SDK headers (OpenAI, Anthropic, Bedrock, Vertex, OpenRouter, Cohere, Stainless, Google, Kilo Code, Cline, Roo Code, Goose, Claude Code). Use `forwardHeaders` to extend it with your own headers without modifying the gateway source.

```ts
advanced: {
  forwardHeaders: [
    "x-my-custom-trace-id",
    "x-internal-team",
  ],
}
```

### Passing Framework State to Hooks

You can pass per-request info from your framework into the gateway via the second `state` argument on the handler, then read it in hooks through `ctx.state`.

```ts
import { gateway } from "@hebo-ai/gateway";
import { Elysia } from "elysia";

const basePath = "/v1/gateway";

const gw = gateway({
  basePath,
  providers: {
    // ...
  },
  models: {
    // ...
  },
  hooks: {
    resolveProvider: async (ctx) => {
      // Select provider based on userId
      const user = ctx.state.auth.userId;
      if (user.startsWith("vip:")) {
        return ctx.providers["openai"];
      } else {
        return ctx.providers["groq"];
      }
    },
  },
});

const app = new Elysia()
  .derive(({ headers }) => ({
    auth: {
      userId: headers["x-user-id"],
    },
  }))
  .all(`${basePath}/*`, ({ request, auth }) => gw.handler(request, { auth }), { parse: "none" })
  .listen(3000);
```

> [!NOTE]
> The `parse: 'none'` hook is required to prevent Elysia from consuming the body.

### Selective Route Mounting

If you want to have more flexibility, for example for custom rate limit checks per route, you can also choose to only mount individual routes from the gateway's `routes` property.

```ts
const gw = gateway({
  /// ...
});

const app = new Elysia()
  .mount("/v1/gateway/chat", gw.routes["/chat/completions"].handler)
  .listen(3000);

console.log(`🐒 /chat/completions mounted to ${app.server?.url}/chat`);
```

### Low-level Schemas & Converters

We also provide full schemas, helper functions and types to convert between **OpenAI <> Vercel AI SDK** for advanced use cases like creating your own endpoint. They are available via deep-imports and completely tree-shakeable.

```ts
import { createGroq } from "@ai-sdk/groq";
import {
  ChatCompletionsBodySchema,
  convertToTextCallOptions,
  toChatCompletionsStreamResponse,
} from "@hebo-ai/gateway/endpoints/chat-completions";
import { forwardParamsMiddleware } from "@hebo-ai/gateway/middleware/common";
import { streamText, wrapLanguageModel } from "ai";
import * as z from "zod";

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

export async function handler(req: Request): Promise<Response> {
  const body = await req.json();

  const parsed = ChatCompletionsBodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(z.prettifyError(parsed.error), { status: 422 });
  }

  const { model, ...inputs } = parsed.data;

  const textOptions = convertToTextCallOptions(inputs);

  const result = await streamText({
    model: wrapLanguageModel({
      model: groq(model),
      middleware: forwardParamsMiddleware("groq"),
    }),
    ...textOptions,
  });

  return toChatCompletionsStreamResponse(result, model);
}
```

Non-streaming versions are available via `toChatCompletionsResponse`. Equivalent schemas and helpers are available in the `audio-transcriptions`, `conversations`, `embeddings` and `models` endpoints.

> [!TIP]
> Since Zod v4.3 you can generate a JSON Schema from any zod object by calling `z.toJSONSchema(...)`. This is useful for producing OpenAPI documentation from the same source of truth.
