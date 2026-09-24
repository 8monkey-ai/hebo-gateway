import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { xaiReasoningMiddleware } from "./middleware";

test("xai middleware > matching patterns", () => {
  const languageMatching = [
    "xai/grok-4.1-fast-reasoning",
    "xai/grok-4.2-reasoning",
    "xai/grok-4.2-multi-agent",
    "xai/grok-4.3",
    "xai/grok-4.5",
    "xai/grok-4.6",
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
    model: new MockLanguageModelV4(),
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
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map medium effort to medium", async () => {
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
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "medium" },
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
    model: new MockLanguageModelV4(),
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
    model: new MockLanguageModelV4(),
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
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should disable reasoning with none when disabled", async () => {
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
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "none" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map none effort to none", async () => {
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
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "none" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map xhigh effort to xhigh on Grok 4.6", async () => {
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
    model: new MockLanguageModelV4({ modelId: "grok-4.6" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "xhigh" },
      unknown: {},
    },
  });
});

test("xaiReasoningMiddleware > should map max effort to xhigh on Grok 4.6", async () => {
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
    model: new MockLanguageModelV4({ modelId: "grok-4.6" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "xhigh" },
      unknown: {},
    },
  });
});

// `xai/grok-4.2-reasoning` resolves to this native ID, and the 4.20 line rejects the parameter
// outright, so nothing may be sent for it — not even `none`.
for (const modelId of [
  "grok-4.20-0309-reasoning",
  "grok-4.20-0309-non-reasoning",
  "grok-4.20-reasoning",
]) {
  test(`xaiReasoningMiddleware > should drop the effort for ${modelId}`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        xai: { reasoningEffort: "high" },
        unknown: {
          reasoning: { enabled: true, effort: "high" },
        },
      },
    };

    const result = await xaiReasoningMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV4({ modelId }),
    });

    expect(result).toEqual({
      prompt: [],
      providerOptions: {
        xai: { reasoningEffort: undefined },
        unknown: {},
      },
    });
  });
}

test("xaiReasoningMiddleware > should keep the effort for the 4.20 multi-agent model", async () => {
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
    model: new MockLanguageModelV4({ modelId: "grok-4.20-multi-agent-0309" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      xai: { reasoningEffort: "high" },
      unknown: {},
    },
  });
});
