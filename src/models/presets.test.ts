import { describe, expect, test } from "bun:test";

import { MockProviderV4 } from "ai/test";

import { CANONICAL_PROVIDER_IDS } from "../providers/types.ts";
import * as anthropic from "./anthropic/presets.ts";
import { createModelCatalog, defineModelCatalog, type ModelGroup } from "./catalog.ts";
import type { ModelFamily } from "./family.ts";
import * as google from "./google/presets.ts";
import * as moonshot from "./moonshot/presets.ts";
import * as openai from "./openai/presets.ts";
import * as xai from "./xai/presets.ts";

// Every lab module, found on disk.
const LABS = await Promise.all(
  [...new Bun.Glob("*/presets.ts").scanSync({ cwd: import.meta.dir, absolute: true })].map(
    (path) => import(path) as Promise<Record<string, ModelFamily>>,
  ),
);

const providers = Object.fromEntries(CANONICAL_PROVIDER_IDS.map((p) => [p, new MockProviderV4()]));

const ids = (group: ModelGroup | undefined) =>
  Object.keys(createModelCatalog(defineModelCatalog(group), providers, { source: false }).current!);

describe("bundled model families", () => {
  for (const lab of LABS) {
    for (const [name, family] of Object.entries(lab)) {
      test(`${name}: latest is a non-empty part of all`, () => {
        const all = ids(family.all);
        const latest = ids(family.latest);

        expect(latest.length).toBeGreaterThan(0);
        for (const id of latest) expect(all).toContain(id);
      });

      test(`${name}: all includes every named group`, () => {
        const all = ids(family.all);
        for (const [key, group] of Object.entries<ModelGroup>(family)) {
          for (const id of ids(group)) expect(all, `${name}.${key}`).toContain(id);
        }
      });
    }
  }

  test("version groups select by version", () => {
    expect(ids(anthropic.claude["v4.6"])).toEqual([
      "anthropic/claude-opus-4-6",
      "anthropic/claude-sonnet-4-6",
    ]);
    expect(ids(anthropic.claude["v5.x"]).every((id) => /-5(?:-\d)?$/u.test(id))).toBe(true);
    expect(ids(moonshot.kimi["k3.x"]).every((id) => id.startsWith("moonshotai/kimi-k3"))).toBe(
      true,
    );
  });

  test("all includes embedding and transcription models", () => {
    expect(ids(google.gemini.all)).toContain("google/gemini-embedding-2");
    expect(ids(google.gemini.all)).toContain("google/gemini-3.5-transcribe");
    expect(ids(openai.gpt.all)).toContain("openai/gpt-transcribe");
    expect(ids(xai.grok.all)).toContain("xai/grok-voice-transcribe-2.0");
  });

  test("version groups leave out transcription models", () => {
    expect(ids(google.gemini["v3.5"])).toEqual([
      "google/gemini-3.5-flash",
      "google/gemini-3.5-flash-lite",
    ]);
  });

  test("named groups select by pattern", () => {
    const opus = ids(anthropic.claude.opus);
    expect(opus.length).toBeGreaterThan(0);
    expect(opus.every((id) => id.startsWith("anthropic/claude-opus-"))).toBe(true);
  });
});
