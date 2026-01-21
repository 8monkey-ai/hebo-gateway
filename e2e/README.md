# E2E Apps

This folder contains end-to-end example apps used to validate the gateway against multiple frameworks.

## Layout

- `elysia/` - Elysia app
- `hono/` - Hono app
- `next/` - Next.js app
- `tanstack/` - TanStack app

## Run locally

These examples use the root dev dependencies, so run `bun install` at the repo root first.

### Elysia

```sh
cd e2e/elysia
bun elysia/index.ts
```

### Hono

```sh
cd e2e/hono
bun hono/index.ts
```

### Next.js

```sh
cd e2e/next
bun next dev
```

### TanStack

```sh
cd e2e/tanstack
bun vite dev
```

## Notes

Each app is self-contained with its own config.
