/**
 * Refreshes the models.dev snapshot bundled with the package (`src/models/models-dev.json`),
 * which the gateway falls back to when the live catalog cannot be loaded at startup.
 *
 *   bun run models:sync
 */
import { fromModelsDev, MODELS_DEV_API_URL, type ModelsDevApi } from "../src/models/models-dev.ts";

const OUT = new URL("../src/models/models-dev.json", import.meta.url);

const res = await fetch(MODELS_DEV_API_URL);
if (!res.ok) throw new Error(`GET ${MODELS_DEV_API_URL} failed: HTTP ${res.status}`);

const catalog = fromModelsDev((await res.json()) as ModelsDevApi);
const count = Object.keys(catalog).length;
if (count === 0) throw new Error("models.dev returned no usable models");

await Bun.write(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Wrote ${count} models to ${OUT.pathname}`);
