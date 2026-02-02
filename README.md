# Hebo Gateway

Roll your own AI gateway for full control over models, providers, routing logic, guardrails, observability and more ...

## Overview

Existing AI gateways like OpenRouter, Vercel AI Gateway, LiteLLM, and Portkey work out of the box, but they’re hard to extend once your needs go beyond configuration.

Hebo Gateway is an open-source, embeddable AI gateway framework built to live inside your app. It gives you full control over providers, models, routing, and the request lifecycle.

## Features

- 🌐 OpenAI-compatible /chat/completions, /embeddings & /models endpoints.
- 🔌 Integrate into your existing Hono, Elysia, Next.js & TanStack apps.
- 🧩 Provider registry compatible with Vercel AI SDK providers.
- 🧭 Canonical model IDs and parameter naming across providers.
- 🗂️ Model catalog with extensible metadata capabilities.
- 🪝 Hook system to customize routing, auth, rate limits, and shape responses.
- 🧰 Low-level OpenAI-compatible schema, converters, and middleware helpers.

## Installation

```bash
bun install @hebo-ai/gateway
```

## Quickstart

### Setup A Gateway Instance

Start by creating a gateway instance with at least one provider and a few models.

```ts
import { createGroq } from "@ai-sdk/groq";
import { gateway, defineModelCatalog } from "@hebo-ai/gateway";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { gptOss20b, gptOss } from "@hebo-ai/gateway/models/gpt-oss";

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
    // Choose a pre-configured preset for common SOTA models
    gptOss20b,
    // Or add a whole model family with your own provider list
    gptOss["all"].map(
      preset => preset({
        providers: ["groq"],
      })
    ),
  ),
});
```

> [!NOTE]
> Don't forget to install the Groq provider package too: `@ai-sdk/groq`.

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

### Call the Gateway

Since Hebo Gateway exposes OpenAI-compatible endpoints, it can be used with a broad set of common AI SDKs like **Vercel AI SDK**, **TanStack AI**, **LangChain**, the official **OpenAI SDK** and others.

Here is a quick example using the Vercel AI SDK:

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

## Framework Support

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

### Next.js (App Router)

`app/api/gateway/[...all]/route.ts`

```ts
const gw = gateway({
  // Required: add `basePath` to your gateway config
  basePath: "/api/gateway",
  // ...
});

export const POST = gw.handler, GET = gw.handler;
```

### Next.js (Pages Router)

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

## Configuration Reference

### Providers

Hebo Gateway’s provider registry accepts any **Vercel AI SDK Provider**. For Hebo to be able to route a model across different providers, the names need to be canonicalized to a common form, for example 'openai/gpt-4.1-mini' instead of 'gpt-4.1-mini'.

Out-of-the-box canonical providers:

- Amazon Bedrock (`withCanonicalIdsForBedrock`): `@hebo-ai/gateway/providers/bedrock`
- Anthropic (`withCanonicalIdsForAnthropic`): `@hebo-ai/gateway/providers/anthropic`
- Cohere (`withCanonicalIdsForCohere`): `@hebo-ai/gateway/providers/cohere`
- Google Vertex AI (`withCanonicalIdsForVertex`): `@hebo-ai/gateway/providers/vertex`
- Groq (`withCanonicalIdsForGroq`): `@hebo-ai/gateway/providers/groq`
- OpenAI (`withCanonicalIdsForOpenAI`): `@hebo-ai/gateway/providers/openai`
- Voyage (`withCanonicalIdsForVoyage`): `@hebo-ai/gateway/providers/voyage`

If an adapter is not yet provided, you can create your own by wrapping the provider instance with the `withCanonicalIds` helper and define your custom canonicalization mapping & rules.

```ts
import { createAzure } from "@ai-sdk/openai";
import {
  gateway,
  withCanonicalIds,
} from "@hebo-ai/gateway";

const azure = withCanonicalIds(
  createAzure({
    resourceName: process.env["AZURE_RESOURCE_NAME"],
    apiKey: process.env["AZURE_API_KEY"]
  }), {
  mapping: {
    "openai/gpt-4.1-mini": "your-gpt-4.1-mini-deployment-name",
    "openai/text-embedding-3-small": "your-embeddings-3-small-deployment-name",
  }},
);

const gw = gateway({
  providers: {
    azure,
  },
  models: {
    // ...your models pointing at canonical IDs above
  },
});
```

### Models

Registering models tells Hebo Gateway which models are available, under which canonical ID and what capabilities they have.

#### Model Presets

To simplify the registration, Hebo Gateway ships a set of model presets under `@hebo-ai/gateway/models`. Use these when you want ready-to-use catalog entries with sane defaults for common SOTA models.

Presets come in two forms:

- Individual presets (e.g. `gptOss20b`, `claudeSonnet45`) for a single model.
- Family presets (e.g. `claude`, `gemini`, `llama`) which group multiple models and expose helpers like `latest`, `all`, and versioned arrays (for example `claude["v4.5"]`).

Out-of-the-box model presets:

- **Claude** — `@hebo-ai/gateway/models/claude`  
  Family: `claude` (`v4.5`, `v4.x`, `latest`, `all`)

- **Gemini** — `@hebo-ai/gateway/models/gemini`  
  Family: `gemini` (`v2.5`, `v3-preview`, `v2.x`, `v3.x`, `latest`, `preview`, `all`)

- **GPT-OSS** — `@hebo-ai/gateway/models/gpt-oss`  
  Family: `gptOss` (`v1`, `v1.x`, `latest`, `all`)

- **Llama** — `@hebo-ai/gateway/models/llama`  
  Family: `llama` (`v3.1`, `v3.3`, `v4`, `v3.x`, `v4.x`, `latest`, `all`)

- **Cohere** — `@hebo-ai/gateway/models/cohere`  
  Family: `cohere` (`v4`, `v4.x`, `latest`, `all`)

- **Voyage** — `@hebo-ai/gateway/models/voyage`  
  Family: `voyage` (`v2`, `v3`, `v3.5`, `v4`, `v2.x`, `v3.x`, `v4.x`, `latest`, `all`)

```ts
import { defineModelCatalog } from "@hebo-ai/gateway";
import { gptOss20b } from "@hebo-ai/gateway/models/gpt-oss";
import { claudeSonnet45, claude } from "@hebo-ai/gateway/models/claude";

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

#### User-defined Models

As the ecosystem is moving faster than anyone can keep-up with, you can always register your own model entries by following the `CatalogModel` type.

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
      capabilities: [
        "attachments",
        "reasoning",
        "tool_call",
        "structured_output",
        "temperature",
      ],
      providers: ["openai"],
      // Additional properties are merged into the model object
      additionalProperties: {
        customProperty: "customValue",
      }
    },
    // ...
  },
});
```

Note: the only mandatory property is the `providers` array, everything else is optional metadata.

### Hooks

Hooks allow you to plug-into the lifecycle of the gateway and enrich it with additional functionality. All hooks are available as async and non-async.

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
     * @returns Optional RequestPatch to merge into headers / override body.
     * Returning a Response stops execution of the endpoint.
     */
    before: async (ctx: { request: Request }): Promise<RequestPatch | Response | void> => {
      // Example Use Cases:
      // - Transform request body
      // - Verify authentication
      // - Enforce rate limits
      // - Observability integration
      return undefined;
    },
    /**
     * Maps a user-provided model ID or alias to a canonical ID.
     * @param ctx.body The parsed body object with all call parameters.
     * @param ctx.modelId Incoming model ID.
     * @returns Canonical model ID or undefined to keep original.
     */
    resolveModelId?: (ctx: {
      body: ChatCompletionsBody | EmbeddingsBody;
      modelId: ModelId;
    }) => ModelId | void | Promise<ModelId | void> {
      // Example Use Cases:
      // - Resolve modelAlias to modelId
      return undefined;
    },
    /**
     * Picks a provider instance for the request.
     * @param ctx.providers ProviderRegistry from config.
     * @param ctx.models ModelCatalog from config.
     * @param ctx.body The parsed body object with all call parameters.
     * @param ctx.modelId Resolved model ID.
     * @param ctx.operation Operation type ("text" | "embeddings").
     * @returns ProviderV3 to override, or undefined to use default.
     */
    resolveProvider: async (ctx: {
      providers: ProviderRegistry;
      models: ModelCatalog;
      modelId: ModelId;
      body: ChatCompletionsBody | EmbeddingsBody;
      operation: "text" | "embeddings";
    }): Promise<ProviderV3 | void> => {
      // Example Use Cases:
      // - Routing logic between providers
      // - Bring-your-own-key authentication
      return undefined;
    },
    /**
     * Runs after the endpoint handler.
     * @param ctx.response Response returned by the handler.
     * @returns Response to replace, or undefined to keep original.
     */
    after: async (ctx: { response: Response }): Promise<Response | void> => {
      // Example Use Cases:
      // - Transform response
      // - Response logging
      return undefined;
    },
  },
});
```

## OpenAI Extensions

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
- `effort` -> budget = percentage of `max_tokens`
  - `none`: 0%
  - `minimal`: 10%
  - `low`: 20%
  - `medium`: 50% (default)
  - `high`: 80%
  - `xhigh`: 95%

## Advanced Usage

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
    ...textOptions
  });

  return toChatCompletionsStreamResponse(result, model);
}
```

Non-streaming versions are available via `createChatCompletionsResponse`. Equivalent schemas and helpers are available in the `embeddings` and `models` endpoints.

Since Zod v4.3 you can also generate a JSON Schema from any zod object by calling the `z.toJSONSchema(...)` function. This can be useful, for example, to create OpenAPI documentation.
