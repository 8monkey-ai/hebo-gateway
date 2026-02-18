# AGENTS.md

## Purpose
This file gives coding agents a fast, reliable workflow for contributing to `@hebo-ai/gateway`.

## Project Snapshot
- Runtime: Bun + TypeScript (ESM).
- Library type: Embeddable AI gateway framework with OpenAI-compatible endpoints.
- Core domains:
  - Model catalog + presets
  - Provider canonicalization and routing
  - OpenAI-compatible endpoint handlers (`/chat/completions`, `/embeddings`, `/models`)
  - Middleware, telemetry, and framework integration examples

## Technical Design Priorities
1. Simple, clean, concise, and easy-to-read / maintain code.
2. Modular and tree-shakable architecture with clear separation of concerns.
3. Prefer clarity by default, but accept targeted complexity in hot paths when performance gains are measurable.
4. Prefer Bun compiler/runtime optimizations over unnecessary manual micro-optimizations or boilerplate.
5. Runtime-agnostic behavior across Bun, Deno, Node.js, Cloudflare Workers, Vercel, and AWS Lambda.

If priorities conflict, apply this order:
1. Public API compatibility
2. Runtime portability
3. Readability and style consistency
4. Hot-path performance

## Runtime-Agnostic Rules
- Prefer Web-standard APIs (`fetch`, `Request`, `Response`, `URL`, `Headers`, `ReadableStream`) in shared runtime paths.
- Avoid Node-only built-ins (`fs`, `net`, `tls`, `child_process`) in gateway core/runtime code unless explicitly isolated.
- Keep framework/runtime-specific code inside adapters, examples, or optional integration boundaries.
- Validate portability assumptions when changing request/streaming behavior.

## Hot Path Rules
- Minimize per-request allocations and repeated transformations in middleware/converter/handler paths.
- Avoid extra abstraction layers in latency-sensitive code when they do not improve maintainability.
- Keep branches and data-shape conversions explicit in hot paths for predictable performance.

## Repository Map
- `src/index.ts`: public entrypoint.
- `src/gateway.ts`: gateway construction and core lifecycle.
- `src/models/types.ts`: canonical model ID union and catalog shape.
- `src/models/*/presets.ts`: model preset definitions and grouped preset exports.
- `src/providers/*/canonical.ts`: provider-specific canonical model ID mappings.
- `src/providers/registry.ts`: canonical ID adapter wrapper and provider resolution logic.
- `src/endpoints/*`: OpenAI-compatible schema/converter/handler layers.
- `e2e/*`: framework integration examples (Elysia, Hono, Next.js, TanStack).
- `test/` + `*.test.ts`: unit and integration tests.

## Local Commands
- Install deps: `bun install`
- Build: `bun run build`
- Type check: `bun run type-check`
- Test: `bun run test`
- Lint: `bun run lint`
- Format: `bun run format`
- Do not run `bun run clean` unless explicitly requested (`git clean -fdx`).

## Change Workflow
1. Read the touched feature area first (`models`, `providers`, `endpoints`, etc.).
2. Keep edits minimal and localized; avoid broad refactors unless asked.
3. Update related tests when behavior changes.
4. Run `bun run type-check` and `bun run test`.
5. If formatting/linting is impacted, run `bun run format` and `bun run lint`.

## Model Preset Changes
When adding/updating a model preset:
1. Add canonical ID in `src/models/types.ts` (`CANONICAL_MODEL_IDS`) if new.
2. Add/update preset definition in provider family `src/models/<provider>/presets.ts`.
3. Ensure `created` and `knowledge` match `https://models.dev/api.json`.
4. Update grouped exports (`latest`, `all`, version groups) consistently.
5. If provider-native model IDs differ, update mapping in `src/providers/<provider>/canonical.ts`.
6. Add/update tests that cover model resolution and endpoint output where relevant.

## Provider Mapping Changes
When adjusting canonicalization:
- Keep canonical IDs stable and provider-agnostic (`vendor/model-name`).
- Ensure mapping rules stay compatible with provider-specific quirks (prefixes/templates/postfixes).
- Verify both text-generation and embedding model resolution paths when applicable.
- Add targeted tests in `src/providers/*.test.ts` or nearby endpoint tests.

## Testing Expectations
- Prefer focused tests close to the changed code.
- For endpoint shape changes, update schema/converter/handler tests together.
- Run `e2e/` app checks when changes affect framework mounting, request/response wiring, or runtime portability.
- `e2e/` checks are optional for purely internal refactors that do not change observable behavior.

## Guardrails
- Do not remove or rename public exports without explicit request.
- Preserve OpenAI-compatible response contracts unless explicitly changing API behavior.
- If public exports or API contracts change, update `README.md` and the related endpoint/provider tests in the same change.
- Keep comments concise and only where intent is non-obvious.
- Avoid speculative metadata; follow `Model Preset Changes`.

## PR/Commit Checklist
- [ ] Change is scoped to requested behavior.
- [ ] Types compile (`bun run type-check`).
- [ ] Tests pass (`bun run test`) or failures are documented.
- [ ] Model metadata (`created`, `knowledge`) follows `Model Preset Changes` when touched.
- [ ] New canonical IDs are reflected in both model presets and provider mappings.
