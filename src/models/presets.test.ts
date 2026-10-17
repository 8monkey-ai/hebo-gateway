import { expect, test } from "bun:test";

import { qwen } from "./alibaba/presets";
import { nova } from "./amazon/presets";
import { claude } from "./anthropic/presets";
import { defineModelCatalog } from "./catalog";
import { command, embed, north } from "./cohere/presets";
import { deepseek } from "./deepseek/presets";
import { gemini, gemma } from "./google/presets";
import { llama } from "./meta/presets";
import { maiTranscribe } from "./microsoft/presets";
import { minimax } from "./minimax/presets";
import { kimi } from "./moonshot/presets";
import { gpt, gptOss, textEmbeddings } from "./openai/presets";
import { CANONICAL_MODEL_IDS } from "./types";
import { voyage } from "./voyage/presets";
import { grok } from "./xai/presets";
import { glm } from "./zai/presets";

const catalog = defineModelCatalog(
  qwen.all,
  nova.all,
  claude.all,
  command.all,
  embed.all,
  north.all,
  deepseek.all,
  gemini.all,
  gemma.all,
  llama.all,
  maiTranscribe.all,
  minimax.all,
  kimi.all,
  gpt.all,
  gptOss.all,
  textEmbeddings.all,
  voyage.all,
  grok.all,
  glm.all,
);

test("built-in presets > cover exactly the supported canonical model IDs", () => {
  expect(new Set(Object.keys(catalog))).toEqual(new Set(CANONICAL_MODEL_IDS));
});

const removedModels = [
  "anthropic/claude-haiku-3.5",
  "anthropic/claude-haiku-3",
  "anthropic/claude-sonnet-3.5",
  "anthropic/claude-sonnet-3.7",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4",
  "anthropic/claude-opus-4.1",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/embedding-001",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5-pro",
  "openai/gpt-5-codex",
  "openai/gpt-5.1",
  "openai/gpt-5.1-chat",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-5.2-chat",
  "openai/gpt-5.2-codex",
  "openai/gpt-5.3-chat",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.4-nano",
  "deepseek/deepseek-v3.2",
  "deepseek/deepseek-v4-flash",
  "cohere/command-r",
  "cohere/command-r-plus",
  "xai/grok-4.1-fast",
  "xai/grok-4.1-fast-reasoning",
  "xai/grok-4.2-reasoning",
  "xai/grok-4.2-multi-agent",
  "alibaba/qwen3-235b",
  "alibaba/qwen3-32b",
  "alibaba/qwen3.6-max-preview",
  "alibaba/qwen3-coder-next",
  "alibaba/qwen3-vl-235b",
] as const;

test("built-in presets > exclude retired, deprecated and explicitly removed models", () => {
  const canonicalIds = new Set<string>(CANONICAL_MODEL_IDS);
  for (const id of removedModels) {
    expect(canonicalIds.has(id)).toBe(false);
    expect(catalog[id]).toBeUndefined();
  }
});

test("built-in presets > latest groups point at the newest release of each family", () => {
  const ids = (presets: readonly (() => Record<string, unknown>)[]) =>
    presets.map((preset) => Object.keys(preset())[0]);

  expect(ids(claude.latest)).toEqual([
    "anthropic/claude-opus-5.5",
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-fable-5.1",
  ]);
  expect(ids(command.latest)).toEqual(["cohere/command-a-plus"]);
  expect(ids(north.latest)).toEqual(["cohere/north-mini-code", "cohere/north-small-translate"]);
  expect(ids(deepseek.latest)).toEqual([
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v4.1-flash",
  ]);
  expect(ids(gemini.latest)).toEqual(["google/gemini-3.8-flash"]);
  expect(ids(gpt.latest)).toEqual([
    "openai/gpt-6-astra",
    "openai/gpt-6.1-sol",
    "openai/gpt-6-luna",
    "openai/gpt-5.5-pro",
  ]);
  expect(ids(kimi.latest)).toEqual(["moonshot/kimi-k3"]);
  expect(ids(grok.latest)).toEqual(["xai/grok-4.7"]);
  expect(ids(glm.latest)).toEqual(["zhipu/glm-5.3", "zhipu/glm-5.3-flash"]);
});
