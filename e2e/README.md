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
bun index.ts
```

Route: `/v1/gateway/models`

### Hono

```sh
cd e2e/hono
bun index.ts
```

Route: `/v1/gateway/models`

### Next.js

```sh
cd e2e/next
bun next dev
```

Routes:

- App Router: `/api/app/gateway/models`
- Pages Router: `/api/pages/gateway/models`

### TanStack

```sh
cd e2e/tanstack
bun vite dev
```

Route: `/api/gateway/models`

## Notes

Each app is self-contained with its own config.
