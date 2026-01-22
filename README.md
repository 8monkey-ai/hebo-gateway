# Hebo Gateway

Roll your own AI gateway for full control over models, providers, routing logic, and observability.

## Summary & highlights

Hebo Gateway is a configurable AI gateway that standardizes providers, models, and request/response handling behind a single interface.

- OpenAI-compatible /chat/completions, /embeddings & /models endpoints.
- Integrate into your existing Hono, Elysia, and Next.js apps.
- Provider registry compatible with Vercel AI SDK.
- Normalized model IDs and snakeCase/camelCase parameters across providers.
- Model catalog with extensible metadata for capabilities.
- Hook system to customize routing, auth, rate limits, and response shaping.
- Low-level OpenAI-compatible schema, converters, and middleware helpers.

## Installation

```bash
bun install @hebo-ai/gateway
```

## Quickstart

### Configuration

```ts
import { 
  gateway,
  createModelCatalog,
  createProviderRegistry,
  createNormalizedAmazonBedrock
} from "@hebo-ai/gateway";

export const gw = gateway({
  // Provider Registry
  // Compatible with Vercel AI SDK providers. Wrapped providers handle:
  // - normalized modelIds (e.g. Bedrock)
  // - parameter conversion between snakeCase and camelCase
  providers: createProviderRegistry({
    bedrock: createNormalizedAmazonBedrock({
      accountId: process.env.AWS_ACCOUNT_ID,
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }),
    // ...
  }),
  // Model Catalog
  // JS objects with a predefined set of attributes.
  // Add custom attributes as needed (e.g. pricing).
  models: createModelCatalog({
    "anthropic/claude-sonnet-4.5": {
      name: "Claude Sonnet 4.5",
      created: "2025-09-29",
      knowledge: "2025-07",
      modalities: {
        input: ["text", "image", "pdf", "audio", "video"],
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
    },
    // ...
  }),
  // Hooks
  hooks: {
    before: async (request: Request) => {
      // Use cases:
      // - modify the request body
      // - check rate limit
    },
    resolveModelId: async (modelId: string) => {
      // Use cases:
      // - modelAlias => modelId
    },
    resolveProvider: async (
      originalModelId: string,
      resolvedModelId: string
    ) => {
      // Use cases:
      // - select preferred provider from multiple possible
      // - create custom provider with BYOK auth
    },
    after: async (response: Response) => {
      // Use cases:
      // - transform response before returning
      // - update logging information
    },
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
