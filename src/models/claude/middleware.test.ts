import { expect, test } from "bun:test";

import { anthropicReasoningMiddleware } from "./middleware";

test("anthropicReasoningMiddleware > should transform reasoning_effort string to thinking budget", async () => {
  const params: any = {
    maxOutputTokens: 10000,
    providerOptions: {
      unhandled: {
        reasoning: { effort: "high" },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should respect Anthropic minimum budget of 1024", async () => {
  const params: any = {
    maxOutputTokens: 2000,
    providerOptions: {
      unhandled: {
        reasoning: { effort: "minimal" },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    maxOutputTokens: 2000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 1024,
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should transform reasoning object to thinking budget", async () => {
  const params: any = {
    providerOptions: {
      unhandled: {
        reasoning: {
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 2000,
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should handle disabled reasoning", async () => {
  const params: any = {
    providerOptions: {
      unhandled: {
        reasoning: {
          enabled: false,
        },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    providerOptions: {
      anthropic: {
        thinking: {
          type: "disabled",
        },
      },
      unhandled: {},
    },
  });
});
