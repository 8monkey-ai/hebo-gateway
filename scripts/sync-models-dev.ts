/**
 * Refreshes the models.dev snapshots bundled with each lab (`src/models/<lab>/models-dev.json`),
 * which the gateway falls back to when the live catalog cannot be loaded. Labs are found on
 * disk: each `src/models/<lab>/presets.ts` registers its namespace when imported, and each
 * `src/providers/<provider>/canonical.ts` the models.dev providers backing it.
 *
 *   bun run models:sync    # write the snapshots
 *   bun run models:check   # only list how they differ from the live data; exits 1 if they do
 */
import { getRegisteredLabs, type ModelLab } from "../src/models/catalog.ts";
import { fromModelsDev, MODELS_DEV_API_URL, type ModelsDevApi } from "../src/models/models-dev.ts";
import type { ModelsDevCatalog } from "../src/models/types.ts";

const check = process.argv.includes("--check");
const root = new URL("../src/models/", import.meta.url).pathname;

// Provider adapters register the models.dev providers that back them when imported.
const adapters = new URL("../src/providers/", import.meta.url).pathname;
for (const path of new Bun.Glob("*/canonical.ts").scanSync({ cwd: adapters })) {
  // oxlint-disable-next-line no-await-in-loop
  await import(`${adapters}${path}`);
}
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

/** Top-level fields that differ, with providers broken out (`providers.bedrock`). */
function changedFields(a: Record<string, unknown>, b: Record<string, unknown>, prefix = "") {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (Bun.deepEquals(a[key], b[key])) continue;
    if (key === "providers" && !prefix) {
      out.push(...changedFields(a[key] as never, b[key] as never, "providers."));
    } else out.push(`${prefix}${key}`);
  }
  return out;
}

/** Lists models added, removed or changed upstream; returns how many differ. */
function reportDrift(dir: string, before: ModelsDevCatalog, after: ModelsDevCatalog) {
  let count = 0;
  for (const id in after) {
    if (!(id in before)) console.log(`  ${dir}: + ${id}`);
    else if (Bun.deepEquals(before[id], after[id])) continue;
    else console.log(`  ${dir}: ~ ${id} (${changedFields(before[id]!, after[id]!).join(", ")})`);
    count++;
  }
  for (const id in before) {
    if (id in after) continue;
    console.log(`  ${dir}: - ${id}`);
    count++;
  }
  return count;
}

const res = await fetch(MODELS_DEV_API_URL);
if (!res.ok) throw new Error(`GET ${MODELS_DEV_API_URL} failed: HTTP ${res.status}`);

const catalog = fromModelsDev((await res.json()) as ModelsDevApi, folders.values());
if (Object.keys(catalog).length === 0) throw new Error("models.dev returned no usable models");

let drift = 0;
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

  if (check) {
    drift += reportDrift(dir, before, slice);
    continue;
  }
  // oxlint-disable-next-line no-await-in-loop
  await Bun.write(out, `${JSON.stringify(slice, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(slice).length} models to ${out}`);
}

if (check) {
  console.log(drift === 0 ? "Snapshots are up to date." : `${drift} models differ.`);
  if (drift > 0) process.exit(1);
}
