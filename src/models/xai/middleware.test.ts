import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { xaiReasoningMiddleware } from "./middleware";

test("xai middleware > matching patterns", () => {
  const languageMatching = [
    "xai/grok-4.1-fast-reasoning",
    "xai/grok-4.2-reasoning",
    "xai/grok-4.2-multi-agent",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const languageNonMatching = [
    "xai/grok-4.1-fast",
    "xai/grok-4.2",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of languageMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(xaiReasoningMiddleware);
  }

  for (const id of languageNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(xaiReasoningMiddleware);
  }
});

test("xaiReasoningMiddleware > should map low effort to low", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "low" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map high effort to high", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map medium effort to high", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map minimal effort to low", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "low" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map xhigh effort to high", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "xhigh" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map max effort to high", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "max" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should clear reasoning when disabled", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: undefined },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map none effort to undefined", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "none" },
      },
    },
  };

  const result = await xaiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: undefined },
      unknown: {},
    },
  });
});
