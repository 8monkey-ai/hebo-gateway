/**
 * Refreshes the models.dev snapshots bundled with each lab (`src/models/<lab>/models-dev.json`),
 * which the gateway falls back to when the live catalog cannot be loaded. Labs are found on
 * disk: each `src/models/<lab>/presets.ts` registers its namespace when imported.
 *
 *   bun run models:sync
 */
import { getRegisteredLabs, type ModelLab } from "../src/models/catalog.ts";
import { fromModelsDev, MODELS_DEV_API_URL, type ModelsDevApi } from "../src/models/models-dev.ts";
import type { ModelsDevCatalog } from "../src/models/types.ts";

const root = new URL("../src/models/", import.meta.url).pathname;
const presets = [...new Bun.Glob("*/presets.ts").scanSync({ cwd: root })];
presets.sort();

// Lab folder -> the lab its presets register.
const folders = new Map<string, ModelLab>();
for (const path of presets) {
  const before = new Set(getRegisteredLabs().keys());
  // oxlint-disable-next-line no-await-in-loop
  await import(`${root}${path}`);
  const added = [...getRegisteredLabs().values()].filter((lab) => !before.has(lab.namespace));
  if (added.length !== 1) throw new Error(`${path} must register exactly one lab`);
  folders.set(path.slice(0, path.indexOf("/")), added[0]!);
}

/**
 * Middleware is built from the reasoning controls, so changes to them are listed for review:
 * an upstream data mistake would change what requests send.
 */
function reportReasoningChanges(before: ModelsDevCatalog, after: ModelsDevCatalog) {
  for (const id in after) {
    const providers = after[id]!.providers;
    for (const provider in providers) {
      const was = before[id]?.providers[provider];
      if (!was) continue;
      const a = JSON.stringify(was.reasoning);
      const b = JSON.stringify(providers[provider]!.reasoning);
      if (a !== b) console.log(`  reasoning of ${id} on ${provider}: ${a} -> ${b}`);
    }
  }
}

const res = await fetch(MODELS_DEV_API_URL);
if (!res.ok) throw new Error(`GET ${MODELS_DEV_API_URL} failed: HTTP ${res.status}`);

const catalog = fromModelsDev((await res.json()) as ModelsDevApi, folders.values());
if (Object.keys(catalog).length === 0) throw new Error("models.dev returned no usable models");

for (const [dir, { namespace }] of folders) {
  const slice: ModelsDevCatalog = {};
  for (const id in catalog) {
    if (id.startsWith(`${namespace}/`)) slice[id] = catalog[id];
  }

  const out = `${root}${dir}/models-dev.json`;
  // oxlint-disable-next-line no-await-in-loop
  const file = Bun.file(out);
  // oxlint-disable-next-line no-await-in-loop
  const before = (await file.exists()) ? ((await file.json()) as ModelsDevCatalog) : {};
  reportReasoningChanges(before, slice);

  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(out, `${JSON.stringify(slice, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(slice).length} models to ${out}`);
}
