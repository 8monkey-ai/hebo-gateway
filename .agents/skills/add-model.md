# Add Model or Provider

Comprehensive guide for adding new models or providers to the `@hebo-ai/gateway` model catalog.

## When to Use

Invoke this skill when:

- Adding a new model to an existing provider family
- Adding an entirely new model family
- Adding provider support for an existing model
- Updating model metadata (created date, knowledge cutoff, capabilities)
- Adding a new provider adapter with canonical ID mappings

## Step 1: Research the Model

Gather authoritative metadata from two sources:

### OpenRouter — per-model endpoint (preferred for provider info)

Use the **per-model endpoints endpoint** to look up a single model without downloading the entire catalog:

```
GET https://openrouter.ai/api/v1/models/{model_id}/endpoints
```

The `{model_id}` uses the OpenRouter model ID format (e.g., `anthropic/claude-sonnet-4.6`, `openai/gpt-4.1`, `meta-llama/llama-4-maverick`). If you don't know the exact ID, search the full list with grep:

```bash
curl -s 'https://openrouter.ai/api/v1/models' | grep -oi '"id":"[^"]*<SEARCH_TERM>[^"]*"'
```

Replace `<SEARCH_TERM>` with the model name you're looking for (e.g., `sonnet`, `gpt-4`, `llama`).

Response structure (`data` object):

- `id` — OpenRouter model ID (e.g., `anthropic/claude-sonnet-4.6`)
- `name` — display name
- `created` — Unix timestamp
- `description` — model description
- `architecture.input_modalities` / `output_modalities` — e.g., `["text", "image"]` / `["text"]`
- `endpoints[]` — array of provider endpoints, each with:
  - `provider_name` — e.g., `"Anthropic"`, `"Google"`, `"Amazon Bedrock"`, `"Azure"`
  - `context_length`, `max_completion_tokens`
  - `pricing.prompt`, `pricing.completion`, `pricing.input_cache_read`, `pricing.input_cache_write`
  - `supported_parameters[]` — e.g., `["reasoning", "tools", "tool_choice", "structured_outputs"]`

### models.dev — extract specific models with grep (preferred for dates/capabilities)

The full `api.json` (~1.8 MB) is organized as `{ [provider]: { models: { [model_id]: {...} } } }`. Pipe through `grep` to extract what you need without loading everything into context:

```bash
# Find model IDs matching a pattern — replace <SEARCH_TERM> with the model name
curl -s 'https://models.dev/api.json' | grep -oi '"id":"[^"]*<SEARCH_TERM>[^"]*"'

# Extract a specific model entry (grab ~20 lines after the model ID)
curl -s 'https://models.dev/api.json' | grep -A 20 '"<MODEL_ID>"'
```

Each model entry has:

- `release_date` (YYYY-MM-DD), `knowledge` (cutoff date YYYY-MM-DD)
- `limit.context` (context window), `limit.output` (max output tokens)
- `reasoning` (boolean), `tool_call` (boolean)
- `modalities.input` / `modalities.output`
- `cost.input`, `cost.output`, `cost.cache_read`, `cost.cache_write` (per million tokens)
- `family` — model family name

### Cross-reference strategy

Prefer models.dev for `release_date`, `knowledge` cutoff, and capability booleans. Use OpenRouter's per-model endpoint for provider availability and supported parameters. If a model isn't found in models.dev, use WebSearch to find it on the provider's official docs.

## Step 2: Classify the Model

Determine these attributes:

| Attribute             | Values                                                                      | Notes                      |
| --------------------- | --------------------------------------------------------------------------- | -------------------------- |
| **Type**              | `text-generation` or `embedding`                                            | Determines output modality |
| **Input modalities**  | `text`, `image`, `file`, `audio`, `video`, `pdf`                            | What the model accepts     |
| **Output modalities** | `text`, `image`, `audio`, `video`, `embedding`                              | What the model produces    |
| **Capabilities**      | `attachments`, `reasoning`, `tool_call`, `structured_output`, `temperature` | Feature flags              |

## Step 3: Choose the Canonical ID

Canonical IDs follow the format: `vendor/model-name`

Rules:

- Use the vendor namespace: `anthropic/`, `openai/`, `google/`, `meta/`, `cohere/`, `amazon/`, `minimax/`, `xai/`, `voyage/`
- Use lowercase with hyphens as delimiters
- Include version numbers with dots: `claude-opus-4.7`, `gpt-5.4`
- Include size suffixes where applicable: `-mini`, `-nano`, `-lite`
- Include variant suffixes: `-pro`, `-chat`, `-codex`, `-reasoning`

Add the canonical ID to `CANONICAL_MODEL_IDS` in `src/models/types.ts`, grouped under the correct provider comment block. Keep entries sorted by version within each provider section.

## Step 4: Define the Preset

### File location

`src/models/<family>/presets.ts` where `<family>` matches the vendor namespace.

### Text-generation preset

```typescript
import { presetFor } from "../../utils/preset";
import type { CanonicalModelId } from "../types";
import type { CatalogModel } from "../types";

// Reuse or define a base configuration for the family
const FAMILY_BASE = {
  modalities: {
    input: ["text", "image", "file"] as const,
    output: ["text"] as const,
  },
  capabilities: ["attachments", "tool_call", "structured_output", "temperature"] as const,
  context: 200000,
  providers: ["provider-id"] as const,
} satisfies CatalogModel;

export const modelName = presetFor<CanonicalModelId, CatalogModel>()("vendor/model-id" as const, {
  ...FAMILY_BASE,
  name: "Display Name",
  created: "YYYY-MM-DD", // From models.dev release_date
  knowledge: "YYYY-MM", // From models.dev knowledge
  // Override base fields as needed:
  // capabilities: [...FAMILY_BASE.capabilities, "reasoning"] as const,
  // context: 1000000,
  // providers: ["provider1", "provider2"] as const,
} satisfies CatalogModel);
```

### Embedding preset

```typescript
export const embeddingModel = presetFor<CanonicalModelId, CatalogModel>()(
  "vendor/embedding-model-id" as const,
  {
    name: "Embedding Model Name",
    created: "YYYY-MM-DD",
    context: 8192,
    modalities: {
      input: ["text"] as const,
      output: ["embedding"] as const,
    },
    providers: ["provider-id"] as const,
  } satisfies CatalogModel,
);
```

### Key fields

| Field               | Type                | Required     | Description                              |
| ------------------- | ------------------- | ------------ | ---------------------------------------- |
| `name`              | `string`            | Optional     | Human-readable display name              |
| `created`           | `string`            | Optional     | Release date (YYYY-MM-DD format)         |
| `knowledge`         | `string`            | Optional     | Knowledge cutoff (YYYY-MM format)        |
| `modalities.input`  | `readonly string[]` | Optional     | Supported input types                    |
| `modalities.output` | `readonly string[]` | Optional     | Output types (`"text"` or `"embedding"`) |
| `context`           | `number`            | Optional     | Context window in tokens                 |
| `capabilities`      | `readonly string[]` | Optional     | Feature flags                            |
| `providers`         | `readonly string[]` | **Required** | Which providers serve this model         |

## Step 5: Update Grouped Exports

Each family preset file exports grouped collections. Update these consistently:

### Atomic groups (by version)

```typescript
const familyAtomic = {
  v1: [model1a, model1b],
  v2: [model2a, model2b],
} as const;
```

### Range groups (aggregate versions)

```typescript
const familyGroups = {
  "v1.x": [...familyAtomic["v1"]],
  "v2.x": [...familyAtomic["v2"]],
} as const;
```

### Family-level groups (optional, e.g., by size tier or variant)

```typescript
const familyByTier = {
  lite: [model1Lite, model2Lite],
  pro: [model1Pro, model2Pro],
} as const;
```

### Final export

```typescript
export const family = {
  ...familyAtomic,
  ...familyGroups,
  latest: [...familyAtomic["v2"]], // Most recent stable version
  all: Object.values(familyAtomic).flat(), // Every preset
  // Optional special groups:
  // embeddings: [embeddingModel1, embeddingModel2],
  // preview: [...previewModels],
} as const;
```

Checklist:

- [ ] New version key added to atomic groups
- [ ] Range group updated to include new version
- [ ] `latest` updated if this is the newest stable release
- [ ] `all` automatically picks up new entries via `Object.values().flat()`
- [ ] Specialty groups updated if applicable (`embeddings`, `preview`, `codex`, `chat`, `pro`, etc.)

## Step 6: Determine Provider Support

For each model, determine which providers serve it:

1. Fetch `https://openrouter.ai/api/v1/models/{model_id}/endpoints` — the `endpoints[]` array lists every provider with their `provider_name` and `tag`
2. Cross-check with models.dev provider entries and each provider's official documentation
3. Order the `providers` array in the preset: primary/official provider first, then secondary providers

## Step 7: Add Provider Canonical Mappings

**For every provider listed in the model's `providers` array**, open `src/providers/<provider>/canonical.ts` and determine whether the new model needs an explicit mapping entry.

Each provider has a `withCanonicalIdsFor*` function that transforms canonical IDs to provider-native IDs using a default transformation pipeline and an explicit `MAPPING` override table.

### Action for each provider

1. Open `src/providers/<provider>/canonical.ts`.
2. Simulate the default transformation for the new canonical ID using the provider's configuration (see table below).
3. Look up the provider's actual native model ID in their official docs or API.
4. **If the default transform produces the correct native ID** → no entry needed, but verify by checking how similar models in that family are handled.
5. **If the default transform does NOT produce the correct native ID** → add an explicit entry to the `MAPPING` object.
6. Add a test in `src/providers/<provider>/canonical.test.ts` verifying the mapping resolves correctly.

### Canonicalization options reference

```typescript
type CanonicalIdsOptions = {
  mapping?: Partial<Record<ModelId, string>>; // Explicit canonical → native mappings
  options?: {
    stripNamespace?: boolean; // Remove "vendor/" prefix (default: true)
    normalizeDelimiters?: boolean | string[]; // Convert "." → "-" (default: false)
    prefix?: string; // Prepend to transformed ID
    template?: Record<string, string>; // Template variable substitution
    postfix?: string; // Append to transformed ID
    namespaceSeparator?: "/" | "." | ":"; // Namespace delimiter (default: "/")
  };
};
```

### When default transformation is sufficient

Skip the explicit mapping when `stripNamespace` + `normalizeDelimiters` produces the correct native ID. For example:

- Anthropic: `anthropic/claude-opus-4.7` → strip → `claude-opus-4.7` → normalize → `claude-opus-4-7` ✓
- OpenAI: `openai/gpt-5.4` → strip → `gpt-5.4` ✓
- Voyage: `voyage/voyage-4-lite` → strip → `voyage-4-lite` ✓

### When an explicit mapping is required

Add a `MAPPING` entry when the default transformation does **not** produce the correct provider-native model ID. Common reasons:

- Provider uses a completely different naming scheme (e.g., Bedrock's `anthropic.claude-haiku-4-5-20251001-v1:0`)
- Provider adds version dates or suffixes (e.g., Cohere's `command-a-03-2025`)
- Provider uses org-prefixed paths (e.g., Fireworks' `accounts/fireworks/models/...`)
- Provider uses different casing (e.g., DeepInfra's `meta-llama/Meta-Llama-3.1-8B-Instruct`)

## Step 8: Check Whether Middlewares Are Needed

Middlewares bridge OpenAI-compatible request parameters to provider-native options. They exist at **two levels** — both must be checked:

### Model-level middlewares (`src/models/<family>/middleware.ts`)

Registered via `modelMiddlewareMatcher.useForModel()` and matched by canonical model ID patterns. These handle model-family-specific parameter translation.

| Category       | When needed                                                                                                    | Example                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Reasoning**  | Model supports extended thinking / chain-of-thought. Check if `"reasoning"` is in `capabilities`.              | `claudeReasoningMiddleware` maps `reasoning.effort` → Anthropic `thinking` / `effort` options   |
| **Dimensions** | Embedding model supports variable output dimensions. Check if the provider uses a non-standard parameter name. | `voyageDimensionsMiddleware` maps `dimensions` → Voyage `outputDimension`                       |
| **Caching**    | Model supports prompt caching. Check if `cache_read` / `cache_write` pricing exists in models.dev.             | `claudePromptCachingMiddleware` maps `cache_control` → Anthropic `cacheControl` provider option |

For each applicable category:

1. Check if an existing middleware in `src/models/<family>/middleware.ts` already covers the new model's ID pattern (wildcards like `anthropic/claude-*4*` may already match).
2. If the existing glob patterns **do not** match the new model ID, update the `modelMiddlewareMatcher.useForModel()` call to include it.
3. If no middleware exists for this family yet, create a new `middleware.ts` in `src/models/<family>/` following the established pattern.
4. Add or update tests in `src/models/<family>/middleware.test.ts`.

### Provider-level middlewares (`src/providers/<provider>/middleware.ts`)

Registered via `modelMiddlewareMatcher.useForProvider()` and matched by provider ID. These handle provider-specific parameter translation that applies to **all models** served by that provider, regardless of family.

| Category          | Providers with middleware   | What it does                                                                                                    |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Service tiers** | `bedrock`, `vertex`, `groq` | Maps OpenAI `service_tier` values to provider-native equivalents (e.g., `"scale"` → Bedrock `"reserved"`)       |
| **Reasoning**     | `bedrock`, `fireworks`      | Translates reasoning params into provider-native format (e.g., Bedrock `reasoningConfig`, Fireworks `thinking`) |
| **Caching**       | `bedrock`                   | Maps `cache_control` → Bedrock `cachePoint` with provider-specific TTL handling                                 |

When the new model is served by **multiple providers** (from the `providers` array set in Step 6), check each provider's `middleware.ts`:

1. Verify the provider-level middleware already handles the new model correctly — some middlewares filter internally by model ID (e.g., `bedrockPromptCachingMiddleware` only applies to `nova` and `claude` models).
2. If the middleware's internal filters exclude the new model, update them.
3. If a provider has no middleware for a capability the new model needs, create one in `src/providers/<provider>/middleware.ts` and register it with `modelMiddlewareMatcher.useForProvider()`.
4. Add or update tests in `src/providers/<provider>/middleware.test.ts`.

## Step 9: Write Tests

### Canonical mapping tests (`src/providers/<provider>/canonical.test.ts`)

```typescript
test("withCanonicalIdsForProvider > maps model correctly", () => {
  const provider = withCanonicalIdsForProvider(baseProvider);
  const model = provider.languageModel("vendor/model-id");
  expect(model.modelId).toBe("expected-native-id");
});
```

### Registry resolution tests (`src/providers/registry.test.ts`)

```typescript
test("resolves vendor model through provider", () => {
  const provider = resolveProvider({
    providers: config.providers,
    models: config.models,
    modelId: "vendor/model-id",
    operation: "chat",
  });
  expect(provider).toBeDefined();
});
```

## Step 10: Update README

Update `README.md` when:

- A new model family is added → add entry to the Model Presets list
- A new version group is added to an existing family → update the group list
- A new provider adapter is added → add entry to Built-in Adapters list

The model presets section is at approximately line 189 in README.md. Each family entry follows this format:

```
- **Family** — `@hebo-ai/gateway/models/<family>`
  Export: `exportName` (`group1`, `group2`, ..., `latest`, `all`)
```

## Checklist

- [ ] Canonical ID added to `src/models/types.ts`
- [ ] Preset defined in `src/models/<family>/presets.ts`
- [ ] `created` and `knowledge` dates verified against models.dev
- [ ] Grouped exports updated (atomic, range, latest, all)
- [ ] `providers` array set correctly with proper ordering
- [ ] Each provider's `canonical.ts` checked — explicit mapping added where default transform doesn't produce the correct native ID
- [ ] Canonical mapping tests added for each provider
- [ ] Middlewares checked: reasoning, dimensions, caching, and service tiers — existing patterns updated or new middleware created as needed
- [ ] Tests added/updated for preset, groups, and middlewares
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes
- [ ] README.md updated if new family or version group added
