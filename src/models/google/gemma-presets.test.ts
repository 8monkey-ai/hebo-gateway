import { expect, test } from "bun:test";

import { gemma3_27b, gemma2_9b, gemma } from "./gemma-presets";

test("gemma3_27b > should expose Gemma 3 27B metadata", () => {
  expect(gemma3_27b()).toEqual({
    "google/gemma-3-27b": {
      name: "Gemma 3 27B",
      created: "2025-03-12",
      knowledge: "2024-09",
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      capabilities: ["attachments", "tool_call", "temperature"],
      context: 131072,
      providers: ["vertex", "groq"],
    },
  });
});

test("gemma2_9b > should expose Gemma 2 9B metadata", () => {
  expect(gemma2_9b()).toEqual({
    "google/gemma-2-9b": {
      name: "Gemma 2 9B",
      created: "2024-06-27",
      knowledge: "2024-03",
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      capabilities: ["temperature"],
      context: 8192,
      providers: ["vertex", "groq"],
    },
  });
});

test("gemma.v3 > should include all Gemma 3 models", () => {
  const ids = gemma.v3.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual([
    "google/gemma-3-1b",
    "google/gemma-3-4b",
    "google/gemma-3-12b",
    "google/gemma-3-27b",
  ]);
});

test("gemma.v2 > should include all Gemma 2 models", () => {
  const ids = gemma.v2.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual(["google/gemma-2-2b", "google/gemma-2-9b", "google/gemma-2-27b"]);
});

test("gemma.latest > should point to Gemma 3 models", () => {
  const ids = gemma.latest.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual([
    "google/gemma-3-1b",
    "google/gemma-3-4b",
    "google/gemma-3-12b",
    "google/gemma-3-27b",
  ]);
});

test("gemma.all > should include all Gemma models", () => {
  const ids = gemma.all.map((preset) => Object.keys(preset())[0]);
  expect(ids).toHaveLength(7);
  expect(ids).toContain("google/gemma-3-27b");
  expect(ids).toContain("google/gemma-2-9b");
});
