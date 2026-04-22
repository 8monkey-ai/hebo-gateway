# Hebo Gateway

Roll your own AI gateway for full control over models, providers, routing logic, guardrails, observability and more ...

## 🐒 Overview

Existing AI gateways like OpenRouter, Vercel AI Gateway, LiteLLM, and Portkey work out of the box, but they’re hard to extend once your needs go beyond configuration.

Hebo Gateway is an open-source, embeddable AI gateway framework built to live inside your app. It gives you full control over providers, models, routing, and the request lifecycle.

Learn more in our blog post: [Yet Another AI Gateway?](https://hebo.ai/blog/260127-hebo-gateway/) (`https://hebo.ai/blog/260127-hebo-gateway/`)

## 🍌 Features

- 🌐 OpenAI-compatible `/chat/completions`, `/embeddings` & `/models` endpoints.
- 💬 Open Responses `/responses` endpoint (stateless), including /conversations.
- 🗨️ Anthropic-compatible `/messages` endpoint.
- 🔌 Integrate into your existing Hono, Elysia, Next.js & TanStack apps.
- 🧩 Provider registry compatible with any Vercel AI SDK providers.
- 🧭 Canonical model IDs and parameter naming across providers.
- 🗂️ Model catalog with extensible metadata capabilities.
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
  - [/chat/completions](#chatcompletions) | [/embeddings](#embeddings) | [/models](#models) | [/responses](#responses) | [/messages](#messages) | [/conversations](#conversations)
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
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { gptOss20b, gptOss } from "@hebo-ai/gateway/models/openai";

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
    // Choose a pre-configured preset
    gptOss20b,
    // Or add a whole model family
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

Built-in adapters are available for `Alibaba`, `Anthropic`, `Bedrock`, `Chutes`, `Cohere`, `DeepInfra`, `DeepSeek`, `Fireworks`, `Groq`, `MiniMax`, `Moonshot`, `OpenAI`, `Together AI`, `Vertex`, `Voyage`, `xAI`, and `Z.ai`.

Import the helper from the matching package path:

```ts
// pattern: @hebo-ai/gateway/providers/<provider>
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
```

If you need a provider that is not on that list, Hebo Gateway’s provider registry also accepts any **Vercel AI SDK Provider**.

For Azure, use `createAzure` from `@ai-sdk/azure` directly. Name each [Azure AI Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints) deployment after its Hebo canonical ID (e.g. `anthropic/claude-sonnet-4.5`).

For custom provider setups, wrap the provider instance with `withCanonicalIds` and define your own canonicalization mapping and rules:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { gateway, withCanonicalIds } from "@hebo-ai/gateway";

const myProvider = withCanonicalIds(
  createOpenAICompatible({
    name: "my-provider",
    baseURL: "https://api.my-provider.com/v1",
    apiKey: process.env["MY_PROVIDER_API_KEY"],
  }),
  {
    mapping: {
      "openai/gpt-4.1-mini": "gpt-4.1-mini-custom",
      "anthropic/claude-sonnet-4.5": "claude-sonnet-4-5",
    },
  },
);

const gw = gateway({
  providers: {
    myProvider,
  },
  models: {
    // ...your models pointing at canonical IDs above
  },
});
```

### Models

Start with the built-in model presets when possible. They give you ready-to-use catalog entries with canonical IDs, metadata, and default provider lists.

Built-in preset families are available for `Alibaba Qwen`, `Amazon Nova`, `Anthropic Claude`, `Cohere Command/Embed`, `DeepSeek`, `Google Gemini`, `Meta Llama`, `MiniMax`, `Moonshot Kimi`, `OpenAI GPT/GPT-OSS`, `Voyage`, `xAI Grok`, and `Z.ai GLM`.

#### Model Presets

Hebo Gateway ships a set of model presets under `@hebo-ai/gateway/models`. Use these when you want ready-to-use catalog entries with sane defaults for common SOTA models.

Presets come in two forms:

- Individual presets (e.g. `gptOss20b`, `claudeSonnet45`) for a single model.
- Family presets (e.g. `claude`, `gemini`, `llama`) which group multiple models and expose helpers like `latest`, `all`, `vX` (e.g. `claude["v4.5"]`).

```ts
import { defineModelCatalog } from "@hebo-ai/gateway";
import { gptOss20b } from "@hebo-ai/gateway/models/openai";
import { claudeSonnet45, claude } from "@hebo-ai/gateway/models/anthropic";

// Individual preset
const models = defineModelCatalog(
  gptOss20b({ providers: ["groq"] }),
  claudeSonnet45({ providers: ["bedrock"] }),
);

// Family preset (pick a group and apply the same override to each)
const modelsFromFamily = defineModelCatalog(
  claude["latest"].map((preset) => preset({ providers: ["anthropic"] })),
);
```

Out-of-the-box model presets:

- **Alibaba** — `@hebo-ai/gateway/models/alibaba`  
  Qwen: `qwen` (`v3`, `v3.5`, `v3.6`, `v3.x`, `coder`, `vl`, `embedding`, `embeddings`, `latest`, `all`)

- **Amazon** — `@hebo-ai/gateway/models/amazon`  
  Nova: `nova` (`v1`, `v2`, `v1.x`, `v2.x`, `latest`, `embeddings`, `all`)

- **Anthropic** — `@hebo-ai/gateway/models/anthropic`  
  Claude: `claude` (`v4.7`, `v4.6`, `v4.5`, `v4.1`, `v4`, `v3.7`, `v3.5`, `v3`, `v4.x`, `v3.x`, `haiku`, `sonnet`, `opus`, `latest`, `all`)

- **Cohere** — `@hebo-ai/gateway/models/cohere`  
  Command: `command` (`A`, `R`, `latest`, `all`)
  Embed: `embed` (`v4`, `v3`, `latest`, `all`)

- **DeepSeek** — `@hebo-ai/gateway/models/deepseek`  
  DeepSeek: `deepseek` (`v3.2`, `latest`, `all`)

- **Google** — `@hebo-ai/gateway/models/google`  
  Gemini: `gemini` (`v2.5`, `v3-preview`, `v2.x`, `v3.x`, `embeddings`, `latest`, `preview`, `all`)
  Gemma: `gemma` (`v3`, `v4`, `v3.x`, `v4.x`, `latest`, `all`)

- **Meta** — `@hebo-ai/gateway/models/meta`  
  Llama: `llama` (`v3.1`, `v3.2`, `v3.3`, `v4`, `v3.x`, `v4.x`, `latest`, `all`)

- **MiniMax** — `@hebo-ai/gateway/models/minimax`  
  MiniMax: `minimax` (`v2`, `v2.x`, `latest`, `all`)

- **Moonshot** — `@hebo-ai/gateway/models/moonshot`  
  Kimi: `kimi` (`k2.5`, `k2.6`, `k2.x`, `latest`, `all`)

- **OpenAI** — `@hebo-ai/gateway/models/openai`  
  GPT: `gpt` (`v5`, `v5.1`, `v5.2`, `v5.3`, `v5.4`, `v5.x`, `chat`, `codex`, `pro`, `latest`, `all`)  
  GPT-OSS: `gptOss` (`v1`, `v1.x`, `latest`, `all`)
  Embeddings: `textEmbeddings` (`v3`, `v3.x`, `latest`, `all`)

- **Voyage** — `@hebo-ai/gateway/models/voyage`  
  Voyage: `voyage` (`v2`, `v3`, `v3.5`, `v4`, `v2.x`, `v3.x`, `v4.x`, `latest`, `all`)

- **xAI** — `@hebo-ai/gateway/models/xai`  
  Grok: `grok` (`v4.1`, `v4.2`, `latest`, `all`)

- **Z.ai** — `@hebo-ai/gateway/models/zai`  
  GLM: `glm` (`v5`, `v5.1`, `v5.x`, `latest`, `all`)

#### User-defined Models

If a built-in preset does not exist yet, you can always register your own model entries by following the `CatalogModel` type.

```ts
const gw = gateway({
  providers: {
    // ...
  },
  models: {
    "openai/gpt-5.2": {
      name: "GPT 5.2",
      created: "2025-12-11",
      knowledge: "2025-08",
      modalities: {
        input: ["text", "image", "pdf", "file"],
        output: ["text"],
      },
      context: 400000,
      capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
      providers: ["openai"],
      // Additional properties are merged into the model object
      additionalProperties: {
        customProperty: "customValue",
      },
    },
    // ...
  },
});
```

> [!NOTE]
> The only mandatory property is the `providers` array, everything else is optional metadata.

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
      body: ChatCompletionsBody | EmbeddingsBody;
      operation: "chat" | "embeddings";
    }): Promise<ChatCompletionsBody | EmbeddingsBody | void> => {
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
      body: ChatCompletionsBody | EmbeddingsBody;
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
     * @param ctx.operation Operation type ("chat" | "embeddings").
     * @returns ProviderV3 to override, or undefined to use default.
     */
    resolveProvider: async (ctx: {
      providers: ProviderRegistry;
      models: ModelCatalog;
      body: ChatCompletionsBody | EmbeddingsBody;
      resolvedModelId: ModelId;
      operation: "chat" | "embeddings";
    }): Promise<ProviderV3 | void> => {
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
      result: ChatCompletions | ChatCompletionsStream | Embeddings;
    }): Promise<ChatCompletions | ChatCompletionsStream | Embeddings | void> => {
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
  "model": "anthropic/claude-4-sonnet",
  "messages": [{ "role": "user", "content": "Explain the tradeoffs." }],
  "reasoning": { "effort": "medium" }
}
```

Normalization rules:

- `enabled` -> fall-back to model default if none provided
- `max_tokens`: fall-back to model default if model supports
- `effort` supports: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`
- Generic `effort` -> budget = percentage of `max_tokens`
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

- **reasoning_details**: Standardized array of reasoning steps and generic signatures.
- **extra_content**: Provider-specific extensions, such as **Google's thought signatures** on Vertex AI.

For **Gemini 3** models, returning the thought signature via `extra_content` is mandatory to resume the chain-of-thought; failing to do so may result in errors or degraded performance.

### Service Tier

The chat completions endpoint accepts a provider-agnostic `service_tier` extension:

- `auto`, `default`, `flex`, `priority`, `scale`

Provider-specific mapping:

- **OpenAI**: forwards as OpenAI `serviceTier` (no middleware remap).
- **Groq**: maps to Groq `serviceTier` (`default` -> `on_demand`, `scale`/`priority` -> `performance`).
- **Google Vertex**: maps to request headers via middleware:
  - `default` -> `x-vertex-ai-llm-request-type: shared`
  - `flex` -> `x-vertex-ai-llm-request-type: shared` + `x-vertex-ai-llm-shared-request-type: flex`
  - `priority` -> `x-vertex-ai-llm-request-type: shared` + `x-vertex-ai-llm-shared-request-type: priority`
  - `scale` -> `x-vertex-ai-llm-request-type: dedicated`
- **Amazon Bedrock**: maps to Bedrock `serviceTier.type` (`default`, `flex`, `priority`, `reserved`; `scale` -> `reserved`, `auto` -> omitted/default).

When available, the resolved value is echoed back on response as `service_tier`.

### Prompt Caching

The chat completions endpoint supports both implicit (provider-managed) and explicit prompt caching across OpenAI-compatible providers.

Accepted request fields:

- `prompt_cache_key` + `prompt_cache_retention` (OpenAI style)
- `cache_control` (OpenRouter / Vercel / Claude style)
- `extra_body { google: { cached_content } }` (Gemini style)

```json
{
  "model": "anthropic/claude-sonnet-4.6",
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
- **Anthropic Claude**: maps top-level caching to Anthropic cache control, while message/part `cache_control` breakpoints are preserved.
- **Google Gemini**: maps `cached_content` to Gemini `cachedContent`.
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
import pino from "pino";
import { gateway } from "@hebo-ai/gateway";

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

The `trace` parameter is accepted on all endpoints (`/chat/completions`, `/embeddings`, `/messages`, `/responses`):

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

Metric names and attributes follow OpenTelemetry GenAI semantic conventions. Histogram bucket boundaries are tuned for practical dashboards and alerting rather than copied verbatim from upstream recommendations.

To capture them, configure a global `MeterProvider` before creating the gateway:

```ts
import { metrics } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { gateway } from "@hebo-ai/gateway";

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
import { Elysia } from "elysia";
import { gateway } from "@hebo-ai/gateway";

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
import { streamText, wrapLanguageModel } from "ai";
import { createGroq } from "@ai-sdk/groq";
import * as z from "zod";
import {
  ChatCompletionsBodySchema,
  convertToTextCallOptions,
  toChatCompletionsStreamResponse,
} from "@hebo-ai/gateway/endpoints/chat-completions";
import { forwardParamsMiddleware } from "@hebo-ai/gateway/middleware/common";

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

Non-streaming versions are available via `toChatCompletionsResponse`. Equivalent schemas and helpers are available in the `conversations`, `embeddings` and `models` endpoints.

> [!TIP]
> Since Zod v4.3 you can generate a JSON Schema from any zod object by calling `z.toJSONSchema(...)`. This is useful for producing OpenAPI documentation from the same source of truth.
