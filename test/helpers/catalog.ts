import { readFileSync } from "node:fs";

import type { ProviderV4 } from "@ai-sdk/provider";

import { createModelCatalog, getRegisteredLabs } from "../../src/models/catalog.ts";
import type { ModelCatalog, ModelsDevCatalog, ModelSpec } from "../../src/models/types.ts";

const MODELS_DIR = `${import.meta.dir}/../../src/models`;

// Registers every lab module and provider adapter, found on disk. Loaded synchronously: with a top-level await,
// Bun runs some test files before this module is initialized.
for (const path of new Bun.Glob("*/index.ts").scanSync({ cwd: MODELS_DIR, absolute: true })) {
  require(path);
}
// Provider adapters register the models.dev providers backing them.
for (const path of new Bun.Glob("*/canonical.ts").scanSync({
  cwd: `${MODELS_DIR}/../providers`,
  absolute: true,
})) {
  require(path);
}

/**
 * Loads the bundled models.dev snapshots of every lab for `provider`, registered as `id`,
 * which hands it the native IDs like a gateway does. Returns the models it serves.
 */
export const loadBundledCatalog = (id: string, provider: ProviderV4): ModelCatalog =>
  createModelCatalog(undefined, { [id]: provider }, { source: false }).current!;

const snapshots: ModelsDevCatalog = {};
for (const path of new Bun.Glob("*/models-dev.json").scanSync({
  cwd: MODELS_DIR,
  absolute: true,
})) {
  Object.assign(snapshots, JSON.parse(readFileSync(path, "utf8")) as ModelsDevCatalog);
}
// Lab extras fill the missing models and providers, as in the catalog.
for (const lab of getRegisteredLabs().values()) {
  for (const id in lab.extras) {
    const extra = lab.extras[id]!;
    const model = snapshots[id];
    snapshots[id] = model
      ? { ...model, providers: { ...extra.providers, ...model.providers } }
      : extra;
  }
}

/** Native ID of `modelId` on `provider` in the bundled snapshots (or lab extras), if listed. */
export const bundledNativeId = (provider: string, modelId: string): string | undefined =>
  snapshots[modelId]?.providers[provider]?.id;

/** Every bundled model spec, as `[modelId, provider, spec]`. */
export const bundledSpecs = (): [string, string, ModelSpec][] =>
  Object.entries(snapshots).flatMap(([id, model]) =>
    Object.entries(model!.providers).map(
      ([provider, spec]) => [id, provider, spec!] as [string, string, ModelSpec],
    ),
  );
