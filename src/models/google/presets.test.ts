import { expect, test } from "bun:test";

import {
  gemini35FlashLite,
  gemini36Flash,
  gemini37Flash,
  geminiEmbedding2,
  gemma31b,
  gemma4E4b,
  gemma426bA4b,
  gemma,
  gemini,
} from "./presets";

test("gemini37Flash > should expose Gemini 3.7 Flash metadata", () => {
  expect(gemini37Flash()).toEqual({
    "google/gemini-3.7-flash": {
      name: "Gemini 3.7 Flash",
      created: "2026-08-13",
      knowledge: "2026-03",
      modalities: {
        input: ["text", "image", "pdf", "file", "audio", "video"],
        output: ["text"],
      },
      capabilities: ["attachments", "reasoning", "tool_call", "structured_output"],
      context: 1048576,
      providers: ["vertex"],
    },
  });
});

test("gemini36Flash > should expose Gemini 3.6 Flash metadata", () => {
  expect(gemini36Flash()).toEqual({
    "google/gemini-3.6-flash": {
      name: "Gemini 3.6 Flash",
      created: "2026-07-21",
      knowledge: "2026-03",
      modalities: {
        input: ["text", "image", "pdf", "file", "audio", "video"],
        output: ["text"],
      },
      capabilities: ["attachments", "reasoning", "tool_call", "structured_output"],
      context: 1048576,
      providers: ["vertex"],
    },
  });
});

test("gemini35FlashLite > should expose Gemini 3.5 Flash-Lite metadata", () => {
  expect(gemini35FlashLite()).toEqual({
    "google/gemini-3.5-flash-lite": {
      name: "Gemini 3.5 Flash-Lite",
      created: "2026-07-21",
      knowledge: "2026-03",
      modalities: {
        input: ["text", "image", "pdf", "file", "audio", "video"],
        output: ["text"],
      },
      capabilities: ["attachments", "reasoning", "tool_call", "structured_output"],
      context: 1048576,
      providers: ["vertex"],
    },
  });
});

test("gemini.latest > should point to Gemini 3.7 Flash", () => {
  const ids = gemini.latest.map((preset) => Object.keys(preset())[0]);
  expect(ids).toEqual(["google/gemini-3.7-flash"]);
});

test("gemini.v3.x > should include the new 3.5 Flash-Lite, 3.6 Flash and 3.7 Flash models", () => {
  const ids = gemini["v3.x"].map((preset) => Object.keys(preset())[0]);
  expect(ids).toContain("google/gemini-3.5-flash-lite");
  expect(ids).toContain("google/gemini-3.6-flash");
  expect(ids).toContain("google/gemini-3.7-flash");
});

test("geminiEmbedding2 > should expose GA embedding metadata with multimodal input", () => {
  expect(geminiEmbedding2()).toEqual({
    "google/gemini-embedding-2": {
      name: "Gemini Embedding 2",
      created: "2026-04-23",
      context: 8192,
      modalities: {
        input: ["text", "image", "video", "audio", "pdf"],
        output: ["embedding"],
      },
      providers: ["vertex"],
    },
  });
});

test("gemini.embeddings > should include Gemini Embedding 2 GA", () => {
  const ids = gemini.embeddings.map((preset) => Object.keys(preset())[0]);
  expect(ids).toContain("google/gemini-embedding-2");
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

test("gemma426bA4b > should advertise reasoning capability", () => {
  expect(gemma426bA4b()).toMatchObject({
    "google/gemma-4-26b-a4b": {
      capabilities: ["reasoning", "tool_call", "structured_output", "temperature"],
      context: 262144,
      providers: ["vertex", "deepinfra"],
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
