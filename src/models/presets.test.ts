import { describe, expect, test } from "bun:test";

import { MockProviderV4 } from "ai/test";

import { CANONICAL_PROVIDER_IDS } from "../providers/types.ts";
import * as alibaba from "./alibaba/presets.ts";
import * as amazon from "./amazon/presets.ts";
import * as anthropic from "./anthropic/presets.ts";
import { createModelCatalog, defineModelCatalog, type ModelGroup } from "./catalog.ts";
import * as cohere from "./cohere/presets.ts";
import * as deepseek from "./deepseek/presets.ts";
import type { ModelFamily } from "./family.ts";
import * as google from "./google/presets.ts";
import * as meta from "./meta/presets.ts";
import * as microsoft from "./microsoft/presets.ts";
import * as minimax from "./minimax/presets.ts";
import * as moonshot from "./moonshot/presets.ts";
import * as openai from "./openai/presets.ts";
import * as voyage from "./voyage/presets.ts";
import * as xai from "./xai/presets.ts";
import * as zai from "./zai/presets.ts";

const LABS = [
  alibaba,
  amazon,
  anthropic,
  cohere,
  deepseek,
  google,
  meta,
  microsoft,
  minimax,
  moonshot,
  openai,
  voyage,
  xai,
  zai,
];

const providers = Object.fromEntries(CANONICAL_PROVIDER_IDS.map((p) => [p, new MockProviderV4()]));

const ids = (group: ModelGroup | undefined) =>
  Object.keys(createModelCatalog(defineModelCatalog(group), providers, { source: false }).current!);

describe("bundled model families", () => {
  for (const lab of LABS) {
    for (const [name, family] of Object.entries(lab) as [string, ModelFamily][]) {
      test(`${name}: latest is a non-empty part of all`, () => {
        const all = ids(family.all);
        const latest = ids(family.latest);

        expect(latest.length).toBeGreaterThan(0);
        for (const id of latest) expect(all).toContain(id);
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

  test("named groups select by pattern", () => {
    const opus = ids(anthropic.claude.opus);
    expect(opus.length).toBeGreaterThan(0);
    expect(opus.every((id) => id.startsWith("anthropic/claude-opus-"))).toBe(true);
  });
});
