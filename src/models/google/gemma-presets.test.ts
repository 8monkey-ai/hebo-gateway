import { expect, test } from "bun:test";

import { gemma3_4b, gemma3_27b, gemma2_9b, gemma } from "./gemma-presets";

test("gemma3_4b > should expose vision metadata with vertex and bedrock providers", () => {
  expect(gemma3_4b()).toEqual({
    "google/gemma-3-4b": {
      name: "Gemma 3 4B",
      created: "2024-12-01",
      context: 131072,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      capabilities: ["tool_call", "structured_output", "temperature"],
      providers: ["vertex", "bedrock"],
    },
  });
});

test("gemma3_27b > should expose vision metadata with vertex and bedrock providers", () => {
  expect(gemma3_27b()).toEqual({
    "google/gemma-3-27b": {
      name: "Gemma 3 27B",
      created: "2025-07-27",
      context: 131072,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      capabilities: ["tool_call", "structured_output", "temperature"],
      providers: ["vertex", "bedrock"],
    },
  });
});

test("gemma2_9b > should expose text-only metadata with vertex provider", () => {
  expect(gemma2_9b()).toEqual({
    "google/gemma-2-9b": {
      name: "Gemma 2 9B",
      created: "2024-06-27",
      context: 8192,
      modalities: {
        input: ["text"],
        output: ["text"],
      },
      capabilities: ["temperature"],
      providers: ["vertex"],
    },
  });
});

test("gemma.latest > should include all Gemma 3 models", () => {
  const ids = gemma.latest.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual([
    "google/gemma-3-1b",
    "google/gemma-3-4b",
    "google/gemma-3-12b",
    "google/gemma-3-27b",
  ]);
});

test("gemma.all > should include all 7 Gemma models", () => {
  const ids = gemma.all.map((preset) => Object.keys(preset())[0]);
  expect(ids).toHaveLength(7);
  expect(ids).toContain("google/gemma-3-1b");
  expect(ids).toContain("google/gemma-2-27b");
});

test("gemma.v3 > should include only Gemma 3 models", () => {
  const ids = gemma.v3.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual([
    "google/gemma-3-1b",
    "google/gemma-3-4b",
    "google/gemma-3-12b",
    "google/gemma-3-27b",
  ]);
});
