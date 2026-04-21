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

### models.dev (`https://models.dev/api.json`)

Structure: nested by provider → model. Each model entry has:

- `release_date`, `knowledge` (cutoff date)
- `limit.context` (context window), `limit.output` (max output tokens)
- `reasoning` (boolean), `tool_call` (boolean), `structured_output` (boolean)
- `modalities.input` / `modalities.output`
- `cost.input`, `cost.output`, `cost.cache_read`, `cost.cache_write`

### OpenRouter (`https://openrouter.ai/api/v1/models`)

Structure: flat `data` array of model objects. Each entry has:

- `id` — hierarchical format (e.g., `anthropic/claude-opus-4.6`)
- `context_length`, `architecture.input_modalities` / `output_modalities`
- `pricing.prompt`, `pricing.completion`, `pricing.input_cache_read`, `pricing.input_cache_write`
- Provider details available via the `links.details` endpoint

Cross-reference both sources. Prefer models.dev for dates and capabilities; use OpenRouter for provider availability.

## Step 2: Classify the Model

Determine these attributes:

| Attribute             | Values                                                                      | Notes                                                   |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Type**              | `text-generation` or `embedding`                                            | Determines output modality                              |
| **Reasoning**         | yes/no                                                                      | Include `"reasoning"` in capabilities if yes            |
| **Caching**           | yes/no                                                                      | Indicated by `cache_read`/`cache_write` pricing in APIs |
| **Service tier**      | standard / pro                                                              | Reflected in model naming (e.g., `-pro` suffix)         |
| **Input modalities**  | `text`, `image`, `file`, `audio`, `video`, `pdf`                            | What the model accepts                                  |
| **Output modalities** | `text`, `image`, `audio`, `video`, `embedding`                              | What the model produces                                 |
| **Capabilities**      | `attachments`, `reasoning`, `tool_call`, `structured_output`, `temperature` | Feature flags                                           |

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

## Step 6: Provider Canonical Mappings

Each provider has a `withCanonicalIdsFor*` function in `src/providers/<provider>/canonical.ts` that transforms canonical IDs to provider-native IDs.

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

### Current provider configurations

| Provider       | `stripNamespace` | `normalizeDelimiters` | `namespaceSeparator` | Explicit mappings | Notes                                                     |
| -------------- | ---------------- | --------------------- | -------------------- | ----------------- | --------------------------------------------------------- |
| **anthropic**  | `true`           | `true`                | `/`                  | None              | `anthropic/claude-opus-4.7` → `claude-opus-4-7`           |
| **openai**     | `true`           | —                     | `/`                  | None              | `openai/gpt-5.4` → `gpt-5.4`                              |
| **vertex**     | `true`           | `["anthropic"]`       | `/`                  | None              | Only normalizes delimiters for `anthropic/` models        |
| **voyage**     | `true`           | —                     | `/`                  | None              | `voyage/voyage-4` → `voyage-4`                            |
| **cohere**     | `true`           | —                     | `/`                  | 7 entries         | Version-suffixed native IDs (e.g., `command-a-03-2025`)   |
| **xai**        | `true`           | `true`                | `/`                  | 4 entries         | Reasoning variants mapped explicitly                      |
| **bedrock**    | `false`          | `true`                | `.`                  | ~45 entries       | Template `{ip}` for inference profiles, version postfixes |
| **groq**       | `false`          | —                     | `/`                  | 3 entries         | Some models have unique native names                      |
| **fireworks**  | `false`          | —                     | `/`                  | 8 entries         | Uses `accounts/fireworks/models/` path format             |
| **deepinfra**  | `false`          | —                     | `/`                  | 14 entries        | Uses `org/Model-Name` format                              |
| **togetherai** | `false`          | —                     | `/`                  | 9 entries         | Uses `org/Model-Name-Turbo` format                        |
| **minimax**    | `false`          | —                     | `/`                  | 2 entries         | PascalCase native IDs                                     |
| **chutes**     | `false`          | —                     | `/`                  | 1 entry           | Limited model support                                     |

### When to add an explicit mapping

Add a mapping entry when the default transformation (strip namespace → normalize delimiters → apply prefix/postfix) does **not** produce the correct provider-native model ID.

Common reasons:

- Provider uses a completely different naming scheme (e.g., Bedrock's `anthropic.claude-haiku-4-5-20251001-v1:0`)
- Provider adds version dates or suffixes (e.g., Cohere's `command-a-03-2025`)
- Provider uses org-prefixed paths (e.g., Fireworks' `accounts/fireworks/models/...`)
- Provider uses different casing (e.g., DeepInfra's `meta-llama/Meta-Llama-3.1-8B-Instruct`)

### When default transformation is sufficient

Skip the explicit mapping when `stripNamespace` + `normalizeDelimiters` produces the correct native ID. For example:

- Anthropic: `anthropic/claude-opus-4.7` → strip → `claude-opus-4.7` → normalize → `claude-opus-4-7` ✓
- OpenAI: `openai/gpt-5.4` → strip → `gpt-5.4` ✓
- Voyage: `voyage/voyage-4-lite` → strip → `voyage-4-lite` ✓

## Step 7: Determine Provider Support

For each model, determine which providers serve it:

1. Check OpenRouter's model list for provider availability
2. Check models.dev for provider-specific entries
3. Check each provider's official documentation
4. Order the `providers` array: primary/official provider first, then secondary providers

### Common provider patterns by family

| Family           | Primary     | Common secondary providers                                |
| ---------------- | ----------- | --------------------------------------------------------- |
| Anthropic Claude | `anthropic` | `bedrock`, `vertex`, `azure`                              |
| OpenAI GPT       | `openai`    | —                                                         |
| OpenAI GPT-OSS   | `openai`    | `fireworks`, `groq`, `bedrock`                            |
| Google Gemini    | `vertex`    | —                                                         |
| Google Gemma     | `vertex`    | `deepinfra`, `togetherai`, `groq`, `fireworks`, `bedrock` |
| Meta Llama       | `groq`      | `bedrock`, `fireworks`, `deepinfra`, `togetherai`         |
| Cohere Command   | `cohere`    | `bedrock`                                                 |
| Cohere Embed     | `cohere`    | `bedrock`                                                 |
| Amazon Nova      | `bedrock`   | —                                                         |
| MiniMax          | `minimax`   | `deepinfra`, `togetherai`, `fireworks`, `chutes`          |
| xAI Grok         | `xai`       | —                                                         |
| Voyage           | `voyage`    | —                                                         |

## Step 8: Write Tests

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

## Step 9: Update README

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
- [ ] Provider canonical mappings updated where native ID differs from default
- [ ] `providers` array set correctly with proper ordering
- [ ] Tests added/updated for preset, groups, and canonical mappings
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes
- [ ] README.md updated if new family or version group added
