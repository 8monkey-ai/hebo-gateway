import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { claudeReasoningMiddleware } from "./middleware";

test("claudeReasoningMiddleware > matching patterns", () => {
  const matching = [
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-3.7",
    "anthropic/claude-opus-4.5",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-opus-4.1",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-opus-4",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = [
    "anthropic/claude-sonnet-3.5",
    "anthropic/claude-haiku-3.5",
    "anthropic/claude-haiku-3",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(claudeReasoningMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(claudeReasoningMiddleware);
  }
});

test("claudeReasoningMiddleware > should transform reasoning_effort string to thinking budget", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
      unknown: {},
    },
  });
});

test("claudeReasoningMiddleware > should respect Anthropic minimum budget of 1024", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 1024,
        },
      },
      unknown: {},
    },
  });
});

test("claudeReasoningMiddleware > should transform reasoning object to thinking budget", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 32000,
        },
      },
      unknown: {},
    },
  });
});

test("claudeReasoningMiddleware > should handle disabled reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: false,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      anthropic: {
        thinking: {
          type: "disabled",
        },
      },
      unknown: {},
    },
  });
});

test("claudeReasoningMiddleware > should default reasoning budget when enabled without effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
        },
      },
      unknown: {},
    },
  });
});

test("claudeReasoningMiddleware > should use 64k as default fallback for maxOutputTokens", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          // 0.5 * 64000 = 32000
          enabled: true,
          effort: "medium",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result.providerOptions?.anthropic?.thinking?.budgetTokens).toBe(32000);
});

test("claudeReasoningMiddleware > should cap default maxOutputTokens for Opus 4.1", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "medium",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.1" }),
  });

  expect(result.providerOptions?.anthropic?.thinking?.budgetTokens).toBe(16000);
});

test("claudeReasoningMiddleware > should clamp max_tokens for Opus 4", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          max_tokens: 50000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4" }),
  });

  expect(result.providerOptions?.anthropic?.thinking?.budgetTokens).toBe(32000);
});

test("claudeReasoningMiddleware > should pass through max effort for Claude 4.6", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "max",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "adaptive",
    effort: "max",
  });
});

test("claudeReasoningMiddleware > should map xhigh effort to max for Claude Opus 4.6", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "xhigh",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "adaptive",
    effort: "max",
  });
});

test("claudeReasoningMiddleware > should map max effort to high for Claude Sonnet 4.6", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "max",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.6" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "adaptive",
    effort: "high",
  });
});

test("claudeReasoningMiddleware > should map minimal effort to low for Claude Sonnet 4.6", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "minimal",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.6" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "adaptive",
    effort: "low",
  });
});

test("claudeReasoningMiddleware > should use manual thinking for Claude Sonnet 4.6 when max_tokens is provided", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.6" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "enabled",
    effort: "medium",
    budgetTokens: 2000,
  });
});

test("claudeReasoningMiddleware > should map none effort to low for Claude Sonnet 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "none",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.5" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "enabled",
    effort: "low",
  });
});

test("claudeReasoningMiddleware > should include effort and max_tokens for Claude 4.6", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "adaptive",
    effort: "medium",
    budgetTokens: 2000,
  });
});

test("claudeReasoningMiddleware > should include effort and max_tokens for Claude Sonnet 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.5" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "enabled",
    effort: "medium",
    budgetTokens: 2000,
  });
});

test("claudeReasoningMiddleware > should map max effort to high for Claude Sonnet 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "max",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.5" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "enabled",
    effort: "high",
  });
});

test("claudeReasoningMiddleware > should map xhigh effort to high for Claude Sonnet 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "xhigh",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4.5" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "enabled",
    effort: "high",
  });
});

test("claudeReasoningMiddleware > should keep xhigh as budget for non-4.6 models", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "xhigh",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-sonnet-4" }),
  });

  expect(result.providerOptions?.anthropic?.thinking?.budgetTokens).toBe(60800);
});

test("claudeReasoningMiddleware > should keep xhigh as budget for Claude Opus 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "xhigh",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.5" }),
  });

  expect(result.providerOptions?.anthropic?.thinking).toEqual({
    type: "enabled",
    budgetTokens: 60800,
  });
});
