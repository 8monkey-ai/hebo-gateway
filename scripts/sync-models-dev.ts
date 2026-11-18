/**
 * Refreshes the models.dev snapshots bundled with each lab (`src/models/<lab>/models-dev.json`),
 * which the gateway falls back to when the live catalog cannot be loaded.
 *
 *   bun run models:sync
 */
import { fromModelsDev, MODELS_DEV_API_URL, type ModelsDevApi } from "../src/models/models-dev.ts";
import type { ModelCatalog } from "../src/models/types.ts";

// Canonical namespace -> lab folder.
const LABS: Record<string, string> = {
  alibaba: "alibaba",
  amazon: "amazon",
  anthropic: "anthropic",
  cohere: "cohere",
  deepseek: "deepseek",
  google: "google",
  meta: "meta",
  microsoft: "microsoft",
  minimax: "minimax",
  moonshotai: "moonshot",
  openai: "openai",
  voyageai: "voyage",
  xai: "xai",
  zhipuai: "zai",
};

const res = await fetch(MODELS_DEV_API_URL);
if (!res.ok) throw new Error(`GET ${MODELS_DEV_API_URL} failed: HTTP ${res.status}`);

const catalog = fromModelsDev((await res.json()) as ModelsDevApi, Object.keys(LABS));
if (Object.keys(catalog).length === 0) throw new Error("models.dev returned no usable models");

const slices = new Map<string, ModelCatalog>(Object.values(LABS).map((dir) => [dir, {}]));
for (const [id, model] of Object.entries(catalog)) {
  slices.get(LABS[id.split("/", 1)[0]!]!)![id] = model;
}

for (const [dir, slice] of slices) {
  const out = new URL(`../src/models/${dir}/models-dev.json`, import.meta.url);
  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(out, `${JSON.stringify(slice, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(slice).length} models to ${out.pathname}`);
}
