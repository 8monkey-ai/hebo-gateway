# Hebo Gateway

Roll your own AI gateway for full control over models, providers, routing logic, guardrails, observability and more ...

## Overview

Hebo Gateway is a configurable AI gateway that standardizes providers, models, and request/response handling behind a unified interface. Integrate it into your existing applications or deploy as stand-alone service.

In contrast to other projects like LiteLLM or Portkey, it's built from the ground-up to be highly-extensible to your own needs. This would not have been possible without standing on the shoulders of giants, in this case the Vercel AI SDK.

## Features

- 🌐 OpenAI-compatible /chat/completions, /embeddings & /models endpoints.
- 🔌 Integrate into your existing Hono, Elysia, Next.js & TanStack apps.
- 🧩 Provider registry compatible with Vercel AI SDK providers.
- 🧭 Canonical model IDs and snakeCase/camelCase parameters across providers.
- 🗂️ Model catalog with extensible metadata capabilities.
- 🪝 Hook system to customize routing, auth, rate limits, and shape responses.
- 🧰 Low-level OpenAI-compatible schema, converters, and middleware helpers.

## Installation

```bash
bun add @hebo-ai/gateway
```

## Quickstart

### Configuration

```ts
import {
  gateway,
  createGroqWithCanonicalIds,
  createModelCatalog,
  gptOss20b, gptOss
} from "@hebo-ai/gateway";

export const gw = gateway({
  // PROVIDER REGISTRY
  providers: {
    // Any Vercel AI SDK provider +WithCanonicalIds
    groq: createGroqWithCanonicalIds({
      apiKey: process.env.GROQ_API_KEY,
    },
  },

  // MODEL CATALOG
  models: createModelCatalog(
    // Choose a preset for common SOTA models
    gptOss20b({
      providers: ["groq"],
    }),
    // Or add a whole model family
    ...gptOss["all"].map((model) => 
      model({})
    ),
  ),
});
```

### Mount Route Handlers

Hebo Gateway plugs into any existing framework. Simply mount the gateway’s `handler` under a prefix, and keep using your framework’s existing lifecycle for authentication, logging, observability, and more.

Here is an example using ElysiaJS (our favorite):

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

Since Hebo Gateway exposes OpenAI-Compatible endpoints, it can be used with a broad set of common AI SDKs like Vercel AI SDK, TanStack AI, Langchain, the official OpenAI SDK and others.

Here is a quick example using the Vercel AI SDK:

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

const hebo = createOpenAICompatible({
  name: "hebo",
  baseURL: "http://localhost:3000/v1/gateway",
});

const { text } = await generateText({
  model: hebo("openai/gpt-oss-20b"),
  prompt: "Tell me a joke about monkeys",
});

console.log(text);
```

## Framework Support

Hebo Gateway exposes WinterCG-compatible handlers that integrate into any existing framework.

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

## Advanced Configuration

### Providers

The provider registry accepts any Vercel AI SDK `ProviderV3`. Hebo Gateway simply expects canonical model IDs (for example `openai/gpt-4.1-mini`). If a provider uses different IDs or delimiters, wrap it with `withCanonicalIds` to canonicalize the IDs before registering.

```ts
import { createOpenAI } from "@ai-sdk/openai";
import {
  gateway,
  createModelCatalog,
  createProviderRegistry,
  withCanonicalIds,
} from "@hebo-ai/gateway";

const openai = withCanonicalIds(
  createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  {
    "openai/gpt-4.1-mini": "gpt-4.1-mini",
    "openai/text-embedding-3-small": "text-embedding-3-small",
  },
);

const gw = gateway({
  providers: createProviderRegistry({
    openai,
  }),
  models: createModelCatalog({
    // ...your models pointing at canonical IDs above
  }),
});
```

### Models

#### Presets

Hebo Gateway ships model presets under `models/presets`, exported from the package. Use these when you want ready-to-use catalog entries with sane defaults for common SOTA models. Presets come in two forms:

- Individual presets (e.g. `gptOss20b`, `claudeSonnet45`) for a single model.
- Family presets (e.g. `claude`, `gemini`, `llama`) which group multiple models and expose helpers like `latest`, `all`, and versioned arrays (for example `claude["v4.5"]`).

```ts
import { createModelCatalog, claude, claudeSonnet45, gptOss20b } from "@hebo-ai/gateway";

// Individual preset
const models = createModelCatalog(
  gptOss20b({ providers: ["groq"] }),
  claudeSonnet45({ providers: ["bedrock"] }),
);

// Family preset (pick a group and apply the same override to each)
const modelsFromFamily = createModelCatalog(
  ...claude["latest"].map((preset) => preset({ providers: ["anthropic"] })),
);
```

#### Custom Models

As the ecosystem is moving faster than anyone can keep-up with, you can always define your own custom catalog entries by following the `CatalogModel` type.

```ts
const gw = gateway({
  providers: createProviderRegistry({
    // ...
  }),
  models: createModelCatalog({
    "anthropic/claude-sonnet-4.5": {
      name: "Claude Sonnet 4.5",
      created: "2025-09-29",
      knowledge: "2025-07",
      modalities: {
        input: ["text", "image", "pdf", "file"],
        output: ["text"],
      },
      context: 200000,
      capabilities: [
        "attachments",
        "reasoning",
        "tool_call",
        "structured_output",
        "temperature",
      ],
      providers: ["bedrock"],
      // Additional properties are merged into the model object
      additionalProperties: {
        customProperty: "customValue",
      }
    },
    // ...
  }),
});
```

### Hooks

Hooks allow you to plug-into the lifecycle of the gateway and enrich it with additional functionality.

```ts
const gw = gateway({
  providers: createProviderRegistry({
    // ...
  }),
  models: {
    // ...
  },
  hooks: {
    before: async (request: Request) => {
      // Example Use Cases:
      // - Transform request body
      // - Verify authentication
      // - Enforce rate limits
      // - Observability integration
    },
    resolveModelId: async (modelId: string) => {
      // Example Use Cases:
      // - Resolve modelAlias to modelId
    },
    resolveProvider: async (
      originalModelId: string,
      resolvedModelId: string
    ) => {
      // Example Use Cases:
      // - Routing logic between providers
      // - Bring-your-own-key authentication
    },
    after: async (response: Response) => {
      // Example Use Cases:
      // - Transform response
      // - Response logging
    },
  },
});
```

### Selective Route Mounting

If you want to have more flexibility, for example for custom rate limit checks, you can also choose to only mount individual routes from the gateway's `routes` property.

```ts
const gw = gateway({
  /// ...
});

const app = new Elysia()
  .mount("/v1/gateway/chat", gw.routes["/chat/completions"].handler)
  .listen(3000);

console.log(`🐒 /chat/completions mounted to ${app.server?.url}/chat`);
```


## Low-level functions via deep imports

We also provide low-level helper functions for advanced use cases. They are available via deep-imports and completely tree-shakable.

### Schema

```ts
import {
  // Full schema
  OpenAICompatChatCompletionsParams, // Request
  OpenAICompatChatCompletion, // Response

  // Individual parameters
  OpenAICompatMessage,
  OpenAICompatTemperatureRange,
  OpenAICompatTool,
  OpenAICompatToolChoice,
  OpenAICompatReasoningEffort,
  OpenAICompatReasoning,
  // ...
} from "hebo-ai/gateway/oai-compat/schema";
```

### Message conversion

```ts
import {
  convertToLanguageModelParams,
  convertToModelMessages,
  convertToToolSet,
  convertToToolChoice,
  extractExtraBody,
  toOpenAICompatStreamResponse,
  toOpenAICompatStream,
  OpenAICompatTransformStream,
} from "@hebo-aikit/gateway/oai-compat/helpers";
```
 
### Middlewares

```ts
import {
  openAICompatBedrockTransform,
  openAICompatClaudeTransform,
  // ...
} from "@hebo-aikit/gateway/oai-compat/middlewares";
```
