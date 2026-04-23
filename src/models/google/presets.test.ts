import { expect, test } from "bun:test";

import { geminiEmbedding2, geminiEmbedding2Preview, gemma31b, gemma4E4b, gemma, gemini } from "./presets";

test("geminiEmbedding2 > should expose multimodal embedding metadata", () => {
  expect(geminiEmbedding2()).toEqual({
    "google/gemini-embedding-2": {
      name: "Gemini Embedding 2",
      created: "2026-04-22",
      context: 8192,
      modalities: {
        input: ["text", "image", "video", "audio", "pdf"],
        output: ["embedding"],
      },
      providers: ["vertex"],
    },
  });
});

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

test("gemini.embeddings > should include Gemini Embedding 2 GA and preview", () => {
  const ids = gemini.embeddings.map((preset) => Object.keys(preset())[0]);
  expect(ids).toContain("google/gemini-embedding-2");
  expect(ids).toContain("google/gemini-embedding-2-preview");
  expect(ids).toContain("google/embedding-001");
});

test("gemma31b > should expose text-only metadata with vertex provider", () => {
  expect(gemma31b()).toEqual({
    "google/gemma-3-1b": {
      name: "Gemma 3 1B",
      created: "2025-03-12",
      knowledge: "2025-01",
      modalities: { input: ["text"], output: ["text"] },
      capabilities: ["tool_call", "structured_output", "temperature"],
      context: 32768,
      providers: ["vertex"],
    },
  });
});

test("gemma4E4b > should expose audio+image input with vertex provider", () => {
  expect(gemma4E4b()).toEqual({
    "google/gemma-4-e4b": {
      name: "Gemma 4 E4B",
      created: "2026-04-02",
      knowledge: "2025-01",
      modalities: { input: ["text", "image", "audio"], output: ["text"] },
      capabilities: ["tool_call", "structured_output", "temperature"],
      context: 131072,
      providers: ["vertex"],
    },
  });
});

test("gemma.all > should include 8 Gemma presets (4 v3 + 4 v4)", () => {
  expect(gemma.all).toHaveLength(8);
  const ids = gemma.all.map((preset) => Object.keys(preset())[0]);
  expect(ids).toContain("google/gemma-3-1b");
  expect(ids).toContain("google/gemma-3-27b");
  expect(ids).toContain("google/gemma-4-e2b");
  expect(ids).toContain("google/gemma-4-31b");
});

test("gemma.latest > should point to v4 presets", () => {
  const ids = gemma.latest.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual([
    "google/gemma-4-e2b",
    "google/gemma-4-e4b",
    "google/gemma-4-26b-a4b",
    "google/gemma-4-31b",
  ]);
});
