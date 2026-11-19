import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { type LanguageModelV4CallOptions, type LanguageModelV4TextPart } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { loadBundledCatalog } from "../../../test/helpers/catalog.ts";
import { transform } from "../../../test/helpers/middleware.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
// Also registers the model-level Claude middlewares the full chain below relies on.
import { claudeReasoningMiddleware } from "../../models/anthropic/middleware.ts";
// Also registers the model-level GPT middlewares the full chain below relies on.
import { openAIReasoningMiddleware } from "../../models/openai/middleware.ts";
import type { ModelSpec } from "../../models/types.ts";
import { getModelSpec } from "../registry.ts";
import { withCanonicalIdsForBedrock } from "./canonical.ts";
import {
  bedrockAnthropicBetaMiddleware,
  bedrockAnthropicServiceTierMiddleware,
  bedrockMantleReasoningMiddleware,
  bedrockPromptCachingMiddleware,
  bedrockReasoningMiddleware,
  bedrockServiceTierMiddleware,
} from "./middleware.ts";

/** Wraps a Bedrock provider and hands it the bundled catalog's native IDs, as a gateway does. */
const withBundledCatalog = (...args: Parameters<typeof withCanonicalIdsForBedrock>) => {
  const provider = withCanonicalIdsForBedrock(...args);
  loadBundledCatalog("bedrock", provider);
  return provider;
};

/** A fetch that records the JSON request body and throws, so no request leaves the process. */
const capturingFetch = (
  onBody: (body: Record<string, unknown>, headers: Record<string, string>) => void,
) =>
  ((_input: RequestInfo | URL, init?: RequestInit) => {
    onBody(
      JSON.parse(init!.body as string) as Record<string, unknown>,
      (init!.headers ?? {}) as Record<string, string>,
    );
    throw new Error("captured");
  }) as unknown as typeof fetch;

test("bedrock middlewares > matching provider resolves the reasoning middleware", () => {
  for (const modelId of ["openai/gpt-oss-20b", "anthropic/claude-opus-4-6", "zhipuai/glm-5"]) {
    const middleware = modelMiddlewareMatcher.resolve({
      kind: "text",
      modelId,
      providerId: "amazon-bedrock",
    });
    expect(middleware).toContain(bedrockReasoningMiddleware());
    expect(middleware).toContain(bedrockServiceTierMiddleware);
  }
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
    modelId: "anthropic/claude-opus-4-6",
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

const reasoningConfigOf = async (bedrock: Record<string, unknown>, reasoning?: false) => {
  const result = await transform(
    bedrockReasoningMiddleware(reasoning === false ? { reasoning } : {}),
    {
      providerOptions: { bedrock: bedrock as never },
    },
  );
  return JSON.parse(JSON.stringify(result.providerOptions!["bedrock"])) as Record<string, unknown>;
};

test("bedrockReasoningMiddleware > moves reasoningEffort into reasoningConfig", async () => {
  expect(await reasoningConfigOf({ reasoningEffort: "high" })).toEqual({
    reasoningConfig: { maxReasoningEffort: "high" },
  });
});

test("bedrockReasoningMiddleware > moves Anthropic thinking and effort into reasoningConfig", async () => {
  expect(await reasoningConfigOf({ thinking: { type: "adaptive" }, effort: "max" })).toEqual({
    reasoningConfig: { type: "adaptive", maxReasoningEffort: "max" },
  });
  expect(
    await reasoningConfigOf({ thinking: { type: "enabled", budgetTokens: 4000 }, effort: "high" }),
  ).toEqual({
    reasoningConfig: { type: "enabled", budgetTokens: 4000, maxReasoningEffort: "high" },
  });
});

test("bedrockReasoningMiddleware > turns a thinking toggle, or `none`, into the reasoning type", async () => {
  expect(await reasoningConfigOf({ thinking: { type: "disabled" } })).toEqual({
    reasoningConfig: { type: "disabled" },
  });
  expect(await reasoningConfigOf({ reasoningEffort: "none" })).toEqual({
    reasoningConfig: { type: "disabled" },
  });
});

test("bedrockReasoningMiddleware > drops reasoning for models that don't reason", async () => {
  expect(await reasoningConfigOf({ reasoningEffort: "high" }, false)).toEqual({});
});

test("bedrockReasoningMiddleware > leaves requests without reasoning untouched", async () => {
  expect(await reasoningConfigOf({ serviceTier: "flex" })).toEqual({ serviceTier: "flex" });
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
    model: new MockLanguageModelV4({ modelId: "anthropic/claude-opus-4-6" }),
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

  expect(middleware).toContain(bedrockMantleReasoningMiddleware());
  // The Converse translations must not touch OpenAI-shaped requests.
  expect(middleware).not.toContain(bedrockReasoningMiddleware());
  expect(middleware).not.toContain(bedrockServiceTierMiddleware);
});

test("bedrock middlewares > native provider does not resolve the Mantle middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "openai/gpt-oss-20b",
    providerId: "amazon-bedrock",
  });

  expect(middleware).not.toContain(bedrockMantleReasoningMiddleware());
});

test.each([{ reasoning: { effort: ["low", "high"] } }, {}] as ModelSpec[])(
  "bedrockMantleReasoningMiddleware > forces the reasoning shape for reasoning models (%o)",
  async (spec) => {
    const result = await transform(bedrockMantleReasoningMiddleware(spec), {
      providerOptions: { openai: { reasoningEffort: "high" } },
    });
    expect(result.providerOptions!["openai"]).toEqual({
      reasoningEffort: "high",
      forceReasoning: true,
    });
  },
);

test("bedrockMantleReasoningMiddleware > skips models that don't reason", async () => {
  const result = await transform(bedrockMantleReasoningMiddleware({ reasoning: false }), {
    providerOptions: { openai: {} },
  });
  expect(result.providerOptions!["openai"]).toEqual({});
});

test("bedrock middlewares > GPT-5.x on Mantle keeps reasoning through the full chain", async () => {
  let body: Record<string, unknown> | undefined;

  const provider = withBundledCatalog(
    createAmazonBedrock({ region: "us-east-1", apiKey: "provider-key" }),
    {
      mantle: {
        apiKey: "mantle-key",
        fetch: capturingFetch((captured) => {
          body = captured;
        }),
      },
    },
  );

  const modelId = "openai/gpt-5.6-sol";
  const model = provider.languageModel(modelId);
  const spec = getModelSpec(provider, modelId);
  const middleware = modelMiddlewareMatcher.for(modelId, model.provider, spec);
  const wrapped = wrapLanguageModel({ model, middleware });

  // The canonical ID still matches `openai/*`, so the GPT reasoning translation applies.
  expect(middleware).toContain(openAIReasoningMiddleware(spec));
  expect(middleware).toContain(bedrockMantleReasoningMiddleware(spec));

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

// ---------------------------------------------------------------------------
// Claude on InvokeModel (nested Anthropic provider)
// ---------------------------------------------------------------------------

test("bedrock middlewares > the Anthropic provider keeps none of the Converse translations", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    modelId: "anthropic/claude-opus-4-6",
    providerId: "bedrock.anthropic.messages",
  });

  expect(middleware).toContain(bedrockAnthropicServiceTierMiddleware);
  expect(middleware).toContain(bedrockAnthropicBetaMiddleware);
  expect(middleware).not.toContain(bedrockServiceTierMiddleware);
  expect(middleware).not.toContain(bedrockReasoningMiddleware());
  expect(middleware).not.toContain(bedrockPromptCachingMiddleware);
});

// The InvokeModel tier names match Converse's; only the transport differs (header vs body).
const invokeServiceTierCases = [
  { tier: "auto", expected: undefined },
  { tier: "default", expected: "default" },
  { tier: "flex", expected: "flex" },
  { tier: "priority", expected: "priority" },
  { tier: "scale", expected: "reserved" },
] as const;

for (const { tier, expected } of invokeServiceTierCases) {
  test(`bedrockAnthropicServiceTierMiddleware > should map ${tier} tier to the InvokeModel header`, async () => {
    const result = await bedrockAnthropicServiceTierMiddleware.transformParams!({
      type: "generate",
      params: {
        prompt: [],
        providerOptions: { anthropic: { serviceTier: tier, thinking: { type: "adaptive" } } },
      },
      model: new MockLanguageModelV4({ modelId: "us.anthropic.claude-opus-4-6-v1" }),
    });

    // The Anthropic body only knows `auto` / `standard_only`, which Bedrock does not serve.
    expect(result.providerOptions!["anthropic"]).toEqual({
      serviceTier: undefined,
      thinking: { type: "adaptive" },
    });
    expect(result.headers?.["x-amzn-bedrock-service-tier"]).toBe(expected);
  });
}

test("bedrockAnthropicServiceTierMiddleware > should ignore non-object provider options", async () => {
  const result = await bedrockAnthropicServiceTierMiddleware.transformParams!({
    type: "generate",
    params: { prompt: [], providerOptions: { anthropic: 5 as never } },
    model: new MockLanguageModelV4({ modelId: "us.anthropic.claude-opus-4-6-v1" }),
  });

  expect(result.headers).toBeUndefined();
});

const transformBetaHeader = async (header?: string) => {
  const result = await bedrockAnthropicBetaMiddleware.transformParams!({
    type: "generate",
    params: {
      prompt: [],
      headers: header === undefined ? undefined : { "anthropic-beta": header },
    },
    model: new MockLanguageModelV4({ modelId: "us.anthropic.claude-opus-4-6-v1" }),
  });

  return result.headers?.["anthropic-beta"];
};

test("bedrockAnthropicBetaMiddleware > should drop betas Bedrock does not implement", async () => {
  // The Claude Code list: two first-party-only betas Bedrock 400s on, one it serves.
  expect(
    await transformBetaHeader(
      "advisor-tool-2026-03-01,interleaved-thinking-2025-05-14,prompt-caching-scope-2026-01-05",
    ),
  ).toBe("interleaved-thinking-2025-05-14");
});

test("bedrockAnthropicBetaMiddleware > should clear the header when nothing is supported", async () => {
  expect(await transformBetaHeader("advisor-tool-2026-03-01")).toBeUndefined();
});

test("bedrockAnthropicBetaMiddleware > should match betas regardless of whitespace and casing", async () => {
  // The AWS docs list `Interleaved-thinking-2025-05-14` capitalized; the wire value is not.
  expect(
    await transformBetaHeader(
      " Interleaved-Thinking-2025-05-14 , , advisor-tool-2026-03-01, effort-2025-11-24",
    ),
  ).toBe("interleaved-thinking-2025-05-14,effort-2025-11-24");
});

test("bedrockAnthropicBetaMiddleware > should leave a fully supported header untouched", async () => {
  const header = "context-1m-2025-08-07, output-128k-2025-02-19";

  expect(await transformBetaHeader(header)).toBe(header);
});

test("bedrockAnthropicBetaMiddleware > should ignore a missing header", async () => {
  expect(await transformBetaHeader()).toBeUndefined();
});

/** A Claude model on the nested Anthropic provider (InvokeModel), with its request captured. */
const anthropicModel = (canonicalId: string) => {
  const captured: { body?: Record<string, unknown>; headers?: Record<string, string> } = {};
  const provider = withBundledCatalog(
    createAmazonBedrock({
      region: "us-east-1",
      apiKey: "provider-key",
      fetch: capturingFetch((body, headers) => {
        captured.body = body;
        captured.headers = headers;
      }),
    }),
  );

  return {
    model: provider.languageModel(canonicalId),
    captured,
    spec: getModelSpec(provider, canonicalId),
  };
};

test("bedrock middlewares > Claude on InvokeModel keeps the Anthropic shape through the chain", async () => {
  const modelId = "anthropic/claude-opus-4-6";
  const { model, captured, spec } = anthropicModel(modelId);
  const middleware = modelMiddlewareMatcher.for(modelId, model.provider, spec);
  const wrapped = wrapLanguageModel({ model, middleware });

  expect(middleware).toContain(claudeReasoningMiddleware(spec));

  try {
    await wrapped.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      providerOptions: {
        unknown: { reasoning: { enabled: true, effort: "high" }, service_tier: "flex" },
      },
    });
  } catch {
    // The capturing fetch always throws, so only the request body is asserted on.
  }

  // Native Anthropic fields, not the Converse `reasoningConfig` / `serviceTier` ones.
  expect(captured.body).toMatchObject({
    thinking: { type: "adaptive" },
    anthropic_version: "bedrock-2023-05-31",
  });
  expect(captured.body).not.toHaveProperty("reasoningConfig");
  // InvokeModel takes the tier as a signed request header instead.
  expect(captured.body).not.toHaveProperty("service_tier");
  expect(captured.headers?.["x-amzn-bedrock-service-tier"]).toBe("flex");
});

test("bedrock middlewares > Claude on InvokeModel caches like native Anthropic", async () => {
  const modelId = "anthropic/claude-opus-4-6";
  const { model, captured, spec } = anthropicModel(modelId);
  const wrapped = wrapLanguageModel({
    model,
    middleware: modelMiddlewareMatcher.for(modelId, model.provider, spec),
  });

  try {
    await wrapped.doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "hi",
              providerOptions: { unknown: { cache_control: { type: "ephemeral", ttl: "1h" } } },
            },
          ],
        },
      ],
      // OpenAI's 24h retention has no Claude equivalent; `1h` is the longest it serves.
      providerOptions: { unknown: { cache_control: { type: "ephemeral", ttl: "24h" } } },
    });
  } catch {
    // The capturing fetch always throws, so only the request body is asserted on.
  }

  // Native `cache_control`, not the Converse `cachePoint` translation.
  expect(captured.body).toMatchObject({
    cache_control: { type: "ephemeral", ttl: "1h" },
    messages: [{ content: [{ type: "text", cache_control: { type: "ephemeral", ttl: "1h" } }] }],
  });
  expect(captured.body).not.toHaveProperty("cachePoint");
});

test("bedrock middlewares > unsupported client betas never reach InvokeModel", async () => {
  const modelId = "anthropic/claude-opus-4-6";
  const { model, captured, spec } = anthropicModel(modelId);
  const wrapped = wrapLanguageModel({
    model,
    middleware: modelMiddlewareMatcher.for(modelId, model.provider, spec),
  });

  try {
    await wrapped.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      // Forwarded verbatim from the client: Claude Code sends its first-party list.
      headers: {
        "anthropic-beta":
          "advisor-tool-2026-03-01,prompt-caching-scope-2026-01-05,context-1m-2025-08-07",
      },
    });
  } catch {
    // The capturing fetch always throws, so only the request is asserted on.
  }

  // The provider folds header betas into the body, so both sides must be filtered.
  expect(captured.headers?.["anthropic-beta"]).toBe("context-1m-2025-08-07");
  expect(captured.body?.["anthropic_beta"]).toEqual(["context-1m-2025-08-07"]);
});

test("bedrock middlewares > mid-conversation system turns reach InvokeModel", async () => {
  const { model, captured } = anthropicModel("anthropic/claude-haiku-4-5-20251001");

  try {
    // The Claude Code shape: a top-level system prompt plus a later `system` turn, which
    // Converse rejects with "Multiple system messages that are separated by [...]".
    await model.doGenerate({
      prompt: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: [{ type: "text", text: "Remember 7." }] },
        { role: "assistant", content: [{ type: "text", text: "Got it." }] },
        { role: "system", content: "<system-reminder>Digits only.</system-reminder>" },
        { role: "user", content: [{ type: "text", text: "Which number?" }] },
      ],
    });
  } catch {
    // The capturing fetch always throws, so only the request body is asserted on.
  }

  expect(captured.body?.["system"]).toEqual([
    { type: "text", text: "You are a helpful assistant." },
  ]);
  expect(captured.body?.["messages"]).toMatchObject([
    { role: "user" },
    { role: "assistant" },
    { role: "system" },
    { role: "user" },
  ]);
});

test("bedrockReasoningMiddleware > rejects unsupported between_tools thinking", () => {
  expect(
    transform(bedrockReasoningMiddleware(), {
      providerOptions: { bedrock: { thinking: { type: "between_tools" } } },
    }),
  ).rejects.toThrow("Bedrock reasoningConfig does not support between_tools thinking.");
});
