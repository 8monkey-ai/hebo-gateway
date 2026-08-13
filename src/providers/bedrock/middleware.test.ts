import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { type LanguageModelV4CallOptions, type LanguageModelV4TextPart } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
// Also registers the model-level GPT middlewares the full chain below relies on.
import { openAIReasoningMiddleware } from "../../models/openai/middleware";
import { withCanonicalIdsForBedrock } from "./canonical";
import {
  bedrockClaudeReasoningMiddleware,
  bedrockGptReasoningMiddleware,
  bedrockMantleReasoningMiddleware,
  bedrockPromptCachingMiddleware,
  bedrockServiceTierMiddleware,
} from "./middleware";

test("bedrock middlewares > matching provider resolves GPT middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "openai/gpt-oss-20b",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockGptReasoningMiddleware);
  expect(middleware).toContain(bedrockServiceTierMiddleware);
});

test("bedrock middlewares > matching provider resolves Claude middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockClaudeReasoningMiddleware);
  expect(middleware).toContain(bedrockServiceTierMiddleware);
});

const bedrockServiceTierCases = [
  { tier: "auto", expected: {} },
  { tier: "default", expected: { serviceTier: "default" } },
  { tier: "flex", expected: { serviceTier: "flex" } },
  { tier: "priority", expected: { serviceTier: "priority" } },
  { tier: "scale", expected: { serviceTier: "reserved" } },
] as const;

for (const { tier, expected } of bedrockServiceTierCases) {
  test(`bedrockServiceTierMiddleware > should map ${tier} tier`, async () => {
    const params = {
      prompt: [],
      providerOptions: {
        bedrock: {
          serviceTier: tier,
        },
      },
    };

    const result = await bedrockServiceTierMiddleware.transformParams!({
      type: "generate",
      params,
      model: new MockLanguageModelV4({ modelId: "amazon/nova-2-lite" }),
    });

    expect(result.providerOptions!["bedrock"]).toEqual(expected);
  });
}

test("bedrock middlewares > matching provider resolves prompt caching middleware for Claude", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.6",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockPromptCachingMiddleware);
});

test("bedrock middlewares > matching provider resolves prompt caching middleware for Nova", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "amazon/nova-2-lite",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockPromptCachingMiddleware);
});

test("bedrockGptReasoningMiddleware > should map reasoningEffort into reasoningConfig", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningEffort: "high",
      },
    },
  };

  const result = await bedrockGptReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "openai/gpt-oss-20b" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          maxReasoningEffort: "high",
        },
      },
    },
  });
});

test("bedrockGptReasoningMiddleware > should skip non-gpt models", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningEffort: "medium",
      },
    },
  };

  const result = await bedrockGptReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningEffort: "medium",
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should pass adaptive thinking through with effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "adaptive",
          budgetTokens: 4096,
        },
        effort: "max",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
          budgetTokens: 4096,
          maxReasoningEffort: "max",
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should pass adaptive thinking without budget", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      bedrock: {
        thinking: {
          type: "adaptive",
        },
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should map effort with adaptive thinking", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      bedrock: {
        thinking: {
          type: "adaptive",
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
          maxReasoningEffort: "high",
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should pass max effort with adaptive thinking", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      bedrock: {
        thinking: {
          type: "adaptive",
        },
        effort: "max",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
          maxReasoningEffort: "max",
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should compute fallback budgetTokens using medium effort when type is enabled", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
        },
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
  });

  // medium effort = 50% of maxOutputTokens
  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "enabled",
          budgetTokens: 4096,
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should enforce minimum budgetTokens of 1024 for enabled", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 100,
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
        },
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 100,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "enabled",
          budgetTokens: 1024, // minimum enforced
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should skip non-claude models", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "openai/gpt-oss-20b" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  });
});

test("bedrock middlewares > matching provider resolves Claude middleware for Opus 4.7", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4.7",
    providerId: "amazon-bedrock",
  });

  expect(middleware).toContain(bedrockClaudeReasoningMiddleware);
  expect(middleware).toContain(bedrockServiceTierMiddleware);
});

test("bedrockClaudeReasoningMiddleware > should set adaptive type and maxReasoningEffort for Claude Opus 4.7", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "adaptive",
        },
        effort: "xhigh",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-7" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "adaptive",
          maxReasoningEffort: "xhigh",
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should not set maxReasoningEffort for Claude 3.x", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-sonnet-3.7" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "enabled",
          budgetTokens: 4096,
        },
      },
    },
  });
});

test("bedrockClaudeReasoningMiddleware > should not set maxReasoningEffort for Claude 4.5", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      bedrock: {
        thinking: {
          type: "enabled",
          budgetTokens: 4096,
        },
        effort: "high",
      },
    },
  };

  const result = await bedrockClaudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4.5" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: "enabled",
          budgetTokens: 4096,
        },
      },
    },
  });
});

test("bedrockPromptCachingMiddleware > should map message and part cacheControl to cachePoint", async () => {
  const params: LanguageModelV4CallOptions = {
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Policy",
            providerOptions: {
              bedrock: {
                cacheControl: { type: "ephemeral", ttl: "1h" },
              },
            },
          },
        ],
        providerOptions: {
          bedrock: {
            cacheControl: { type: "ephemeral", ttl: "1h" },
          },
        },
      },
    ],
    providerOptions: {
      bedrock: {},
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params,
    model: new MockLanguageModelV4({ modelId: "amazon/nova-2-lite" }),
  });

  expect(result).toEqual({
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Policy",
            providerOptions: {
              bedrock: {
                cachePoint: { type: "default" },
              },
            },
          } satisfies LanguageModelV4TextPart,
        ],
        providerOptions: {
          bedrock: {
            cachePoint: { type: "default" },
          },
        },
      },
    ],
    providerOptions: {
      bedrock: {},
    },
  });
});

test("bedrockPromptCachingMiddleware > should fallback from top-level cacheControl", async () => {
  const params: LanguageModelV4CallOptions = {
    prompt: [
      {
        role: "system",
        content: "Reusable context",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Question",
          },
        ],
      },
    ],
    providerOptions: {
      bedrock: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params,
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4.6" }),
  });

  expect(result).toEqual({
    prompt: [
      {
        role: "system",
        content: "Reusable context",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Question",
          } satisfies LanguageModelV4TextPart,
        ],
        providerOptions: {
          bedrock: {
            cachePoint: { type: "default", ttl: "1h" },
          },
        },
      },
    ],
    providerOptions: {
      bedrock: {},
    },
  });
});

test("bedrockPromptCachingMiddleware > should skip non-claude non-nova models", async () => {
  const params: LanguageModelV4CallOptions = {
    prompt: [{ role: "system", content: "Hello" }],
    providerOptions: {
      bedrock: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  };

  const result = await bedrockPromptCachingMiddleware.transformParams!({
    type: "generate",
    params: params,
    model: new MockLanguageModelV4({ modelId: "openai/gpt-oss-20b" }),
  });

  expect(result).toEqual({
    prompt: [{ role: "system", content: "Hello" }],
    providerOptions: {
      bedrock: {
        cacheControl: { type: "ephemeral", ttl: "1h" },
      },
    },
  });
});

test("bedrock middlewares > Mantle provider resolves only the Mantle middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "openai/gpt-5.6-sol",
    providerId: "bedrock-mantle.responses",
  });

  expect(middleware).toContain(bedrockMantleReasoningMiddleware);
  // The Converse translations must not touch OpenAI-shaped requests.
  expect(middleware).not.toContain(bedrockGptReasoningMiddleware);
  expect(middleware).not.toContain(bedrockServiceTierMiddleware);
});

test("bedrock middlewares > native provider does not resolve the Mantle middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "openai/gpt-oss-20b",
    providerId: "amazon-bedrock",
  });

  expect(middleware).not.toContain(bedrockMantleReasoningMiddleware);
});

test("bedrockMantleReasoningMiddleware > forces the reasoning shape for namespaced GPT-5.x", async () => {
  const result = await bedrockMantleReasoningMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { openai: { reasoningEffort: "high" } } },
    model: new MockLanguageModelV4({ modelId: "openai.gpt-5.6-sol" }),
  });

  expect(result.providerOptions!["openai"]).toEqual({
    reasoningEffort: "high",
    forceReasoning: true,
  });
});

test("bedrockMantleReasoningMiddleware > skips GPT-OSS, which is not a reasoning-shaped model", async () => {
  const result = await bedrockMantleReasoningMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { openai: { reasoningEffort: "low" } } },
    model: new MockLanguageModelV4({ modelId: "openai.gpt-oss-120b" }),
  });

  expect(result.providerOptions!["openai"]).toEqual({ reasoningEffort: "low" });
});

test("bedrock middlewares > GPT-5.x on Mantle keeps reasoning through the full chain", async () => {
  let body: Record<string, unknown> | undefined;

  const provider = withCanonicalIdsForBedrock(
    createAmazonBedrock({ region: "us-east-1", apiKey: "provider-key" }),
    {
      mantle: {
        apiKey: "mantle-key",
        fetch: ((_input: RequestInfo | URL, init?: RequestInit) => {
          body = JSON.parse(init!.body as string) as Record<string, unknown>;
          throw new Error("captured");
        }) as unknown as typeof fetch,
      },
    },
  );

  const modelId = "openai/gpt-5.6-sol";
  const model = provider.languageModel(modelId);
  const middleware = modelMiddlewareMatcher.for(modelId, model.provider);
  const wrapped = wrapLanguageModel({ model, middleware });

  // The canonical ID still matches `openai/gpt-*`, so the GPT reasoning translation applies.
  expect(middleware).toContain(openAIReasoningMiddleware);
  expect(middleware).toContain(bedrockMantleReasoningMiddleware);

  try {
    await wrapped.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      temperature: 0.7,
      providerOptions: { unknown: { reasoning: { effort: "xhigh" } } },
    });
  } catch {
    // The capturing fetch always throws, so only the request body is asserted on.
  }

  expect(body).toMatchObject({
    model: "openai.gpt-5.6-sol",
    reasoning: { effort: "xhigh" },
  });
  // Reasoning models reject `temperature`.
  expect(body).not.toHaveProperty("temperature");
});
