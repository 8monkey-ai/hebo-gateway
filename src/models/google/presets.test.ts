import { expect, test } from "bun:test";

import { geminiEmbedding2Preview, gemini } from "./presets";

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
