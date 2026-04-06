import { expect, test } from "bun:test";

import { geminiEmbedding2Preview, gemini, gemma, gemma34b } from "./presets";

test("geminiEmbedding2Preview > should expose text embedding metadata", () => {
  expect(geminiEmbedding2Preview()).toEqual({
    "google/gemini-embedding-2-preview": {
      name: "Gemini Embedding 2 (Preview)",
      created: "2026-03-10",
      context: 8192,
      modalities: {
        input: ["text"],
        output: ["embedding"],
      },
      providers: ["vertex"],
    },
  });
});

test("gemini.embeddings > should include Gemini Embedding 2 preview", () => {
  const ids = gemini.embeddings.map((preset) => Object.keys(preset())[0]);
  expect(ids).toContain("google/gemini-embedding-2-preview");
  expect(ids).toContain("google/embedding-001");
});

test("gemma34b > should expose vision metadata with bedrock provider", () => {
  expect(gemma34b()).toEqual({
    "google/gemma-3-4b": {
      name: "Gemma 3 4B",
      created: "2024-12-01",
      context: 131072,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      capabilities: ["temperature"],
      providers: ["vertex", "bedrock"],
    },
  });
});

test("gemma.v3 > should include all Gemma 3 variants", () => {
  const ids = gemma.v3.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual([
    "google/gemma-3-1b",
    "google/gemma-3-4b",
    "google/gemma-3-12b",
    "google/gemma-3-27b",
  ]);
});

test("gemma.v2 > should include all Gemma 2 variants", () => {
  const ids = gemma.v2.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual(["google/gemma-2-2b", "google/gemma-2-9b", "google/gemma-2-27b"]);
});

test("gemma.all > should include all 7 Gemma presets", () => {
  expect(gemma.all).toHaveLength(7);
});
