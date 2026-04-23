import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { nemotronReasoningMiddleware, nvidiaReasoningMiddleware } from "./middleware";

test("nvidia middlewares > matching provider resolves both middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    providerId: "nvidia",
  });

  expect(middleware).toContain(nvidiaReasoningMiddleware);
  expect(middleware).toContain(nemotronReasoningMiddleware);
});

test("nvidiaReasoningMiddleware > should enable thinking via chat_template_kwargs", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/mistral-large-3-675b" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chat_template_kwargs: { enable_thinking: true },
  });
});

test("nvidiaReasoningMiddleware > should disable thinking via chat_template_kwargs", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/deepseek-v3.1-terminus" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chat_template_kwargs: { enable_thinking: false },
  });
});

test("nvidiaReasoningMiddleware > should disable thinking with none effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "none" },
      },
    },
  };

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/kimi-k2" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chat_template_kwargs: { enable_thinking: false },
  });
});

test("nvidiaReasoningMiddleware > should merge with existing chatTemplateKwargs", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        chatTemplateKwargs: { low_effort: true },
        reasoning: { enabled: true },
      },
    },
  };

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chat_template_kwargs: { enable_thinking: true, low_effort: true },
  });
});

test("nvidiaReasoningMiddleware > should pass through when no reasoning config", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        somethingElse: "value",
      },
    },
  };

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/glm-4.7" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    somethingElse: "value",
  });
});

test("nvidiaReasoningMiddleware > should pass through when no nvidia namespace", async () => {
  const params = {
    prompt: [],
    providerOptions: {},
  };

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/glm-4.7" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {},
  });
});

test("nemotronReasoningMiddleware > should set low_effort for nemotron with low effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const result = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chatTemplateKwargs: { low_effort: true },
    reasoning: { enabled: true, effort: "low" },
  });
});

test("nemotronReasoningMiddleware > should set low_effort for nemotron with minimal effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const result = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chatTemplateKwargs: { low_effort: true },
    reasoning: { enabled: true, effort: "minimal" },
  });
});

test("nemotronReasoningMiddleware > should skip non-nemotron models", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const result = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/mistral-large-3-675b" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    reasoning: { enabled: true, effort: "low" },
  });
});

test("nemotronReasoningMiddleware > should skip when reasoning disabled", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    reasoning: { enabled: false },
  });
});

test("nemotronReasoningMiddleware > should not set low_effort for high effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    reasoning: { enabled: true, effort: "high" },
  });
});

test("full chain > nemotron with low effort sets both low_effort and enable_thinking", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const nemotronResult = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params: nemotronResult,
    model: new MockLanguageModelV3({ modelId: "mistralai/mistral-nemotron" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chat_template_kwargs: { enable_thinking: true, low_effort: true },
  });
});

test("full chain > non-nemotron with low effort only sets enable_thinking", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      nvidia: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const nemotronResult = await nemotronReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "nvidia/kimi-k2" }),
  });

  const result = await nvidiaReasoningMiddleware.transformParams!({
    type: "generate",
    params: nemotronResult,
    model: new MockLanguageModelV3({ modelId: "nvidia/kimi-k2" }),
  });

  expect(result.providerOptions!["nvidia"]).toEqual({
    chat_template_kwargs: { enable_thinking: true },
  });
});
