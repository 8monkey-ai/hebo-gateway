# Hebo Gateway

Roll your own AI gateway for full control over models, providers, routing logic, observability and more ...

## Overview

Hebo Gateway is a configurable AI gateway that standardizes providers, models, and request/response handling behind a unified interface. Integrate it into your existing applications or deploy as stand-alone. It's built on the shoulder of giants, the Vercel AI SDK.

## Features

- 🌐 OpenAI-compatible /chat/completions, /embeddings & /models endpoints.
- 🔌 Integrate into your existing Hono, Elysia, Next.js & TanStack apps.
- 🧩 Provider registry compatible with Vercel AI SDK providers.
- 🧭 Normalized model IDs and snakeCase/camelCase parameters across providers.
- 🗂️ Model catalog with extensible metadata for capabilities.
- 🪝 Hook system to customize routing, auth, rate limits, and response shaping.
- 🧰 Low-level OpenAI-compatible schema, converters, and middleware helpers.

## Installation

```bash
bun install @hebo-ai/gateway
```

## Quickstart

### Configuration

```ts
import {
  gateway,
  createProviderRegistry,
} from "@hebo-ai/gateway";

import {
  createNormalizedAmazonBedrock,
} from "@hebo-ai/gateway/providers/bedrock";

import {
  claudeSonnet45,
} from "@hebo-ai/gateway/model-catalog/presets/claude45";

export const gw = gateway({
  // Provider Registry
  // Any Vercel AI SDK provider, canonical ones via `providers` module
  providers: createProviderRegistry({
    bedrock: createNormalizedAmazonBedrock({
      accountId: process.env.AWS_ACCOUNT_ID,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }),
  }),
   // Model Catalog
   // Choose from a set of presets for common SOTA models in `model-catalog/presets`
  models: {
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  },
});
```

### Mount route handler

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
// install @mjackson/node-fetch-server npm package
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


### Custom Models

While hebo-gateawy provides `presets` for many common SOTA models, we might not be able to update the library at the same pace that the ecosystem moves. That's why you can simply your own models by following the `CatalogModel` type.

```ts
export const gw = gateway({
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
      // You can add any additional properties,
      // they will be returned as-is by /models endpoint
      customProperty: "customValue",
    },
    // ...
  }),
});
```

### Hooks 

Hooks allow you to plug-into the lifecycle of the gateway and enrich it with additional functionality.

```ts
export const gw = gateway({
  providers: createProviderRegistry({
    // ...
  }),
  models: {
    // ...
  }),
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
