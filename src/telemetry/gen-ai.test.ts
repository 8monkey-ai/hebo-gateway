import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { metrics, type Attributes } from "@opentelemetry/api";
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type HistogramMetricData,
} from "@opentelemetry/sdk-metrics";
import {
  InvalidToolInputError,
  JSONParseError,
  NoObjectGeneratedError,
  NoSuchToolError,
  ToolCallRepairError,
  TypeValidationError,
} from "ai";

import type { GatewayContext } from "../types";
import {
  getGenAiGeneralAttributes,
  recordAiSdkFeatureError,
  recordFeatureOutcome,
  recordTokenUsage,
} from "./gen-ai";

type Point = {
  value: number;
  attributes: Record<string, unknown>;
};

let exporter: InMemoryMetricExporter;
let reader: PeriodicExportingMetricReader;
let provider: MeterProvider;

const collectTokenUsagePoints = async (): Promise<Point[]> => {
  await reader.forceFlush();
  const histograms: HistogramMetricData[] = [];
  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (
          metric.descriptor.name === "gen_ai.client.token.usage" &&
          metric.dataPointType === DataPointType.HISTOGRAM
        ) {
          histograms.push(metric);
        }
      }
    }
  }
  return histograms.flatMap((h) =>
    h.dataPoints
      .filter((dp) => (dp.value.count ?? 0) > 0)
      .map((dp) => ({ value: dp.value.sum ?? 0, attributes: { ...dp.attributes } })),
  );
};

const collectCounterPoints = async (
  metricName: string,
): Promise<{ value: number; attributes: Attributes }[]> => {
  await reader.forceFlush();
  const points: { value: number; attributes: Attributes }[] = [];
  for (const rm of exporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const md of sm.metrics) {
        if (md.descriptor.name !== metricName) continue;
        for (const dp of md.dataPoints) {
          points.push({ value: dp.value as number, attributes: dp.attributes });
        }
      }
    }
  }
  return points;
};

beforeAll(() => {
  exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
  reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60_000,
    exportTimeoutMillis: 10_000,
  });
  provider = new MeterProvider({ readers: [reader] });
  metrics.setGlobalMeterProvider(provider);
});

afterAll(async () => {
  await provider.shutdown();
  metrics.disable();
});

afterEach(() => {
  exporter.reset();
});

describe("recordTokenUsage", () => {
  test("emits single {type} points when no breakdown is reported", async () => {
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 50,
      },
      { "gen_ai.request.model": "m" },
      "recommended",
    );

    const points = await collectTokenUsagePoints();

    expect(points).toHaveLength(2);
    expect(points).toContainEqual({
      value: 100,
      attributes: { "gen_ai.request.model": "m", "gen_ai.token.type": "input" },
    });
    expect(points).toContainEqual({
      value: 50,
      attributes: { "gen_ai.request.model": "m", "gen_ai.token.type": "output" },
    });
  });

  test("partitions input across cache=read|creation|uncached and does not emit bare input point", async () => {
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.cache_read.input_tokens": 30,
        "gen_ai.usage.cache_creation.input_tokens": 20,
        "gen_ai.usage.output_tokens": 200,
      },
      {},
      "recommended",
    );

    const points = await collectTokenUsagePoints();

    const inputPoints = points.filter((p) => p.attributes["gen_ai.token.type"] === "input");
    expect(inputPoints).toHaveLength(3);
    expect(inputPoints).toContainEqual({
      value: 30,
      attributes: { "gen_ai.token.type": "input", "gen_ai.token.cache": "read" },
    });
    expect(inputPoints).toContainEqual({
      value: 20,
      attributes: { "gen_ai.token.type": "input", "gen_ai.token.cache": "creation" },
    });
    expect(inputPoints).toContainEqual({
      value: 50,
      attributes: { "gen_ai.token.type": "input", "gen_ai.token.cache": "uncached" },
    });
    const inputSum = inputPoints.reduce((sum, p) => sum + p.value, 0);
    expect(inputSum).toBe(100);
    expect(inputPoints.some((p) => p.attributes["gen_ai.token.cache"] === undefined)).toBe(false);
  });

  test("partitions output by reasoning=true|false and does not emit bare output point", async () => {
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 10,
        "gen_ai.usage.output_tokens": 200,
        "gen_ai.usage.reasoning.output_tokens": 150,
      },
      {},
      "recommended",
    );

    const points = await collectTokenUsagePoints();

    const outputPoints = points.filter((p) => p.attributes["gen_ai.token.type"] === "output");
    expect(outputPoints).toHaveLength(2);
    expect(outputPoints).toContainEqual({
      value: 150,
      attributes: { "gen_ai.token.type": "output", "gen_ai.token.reasoning": true },
    });
    expect(outputPoints).toContainEqual({
      value: 50,
      attributes: { "gen_ai.token.type": "output", "gen_ai.token.reasoning": false },
    });
    expect(outputPoints.some((p) => p.attributes["gen_ai.token.reasoning"] === undefined)).toBe(
      false,
    );
  });

  test("omits zero-valued partition members", async () => {
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.cache_read.input_tokens": 100,
        "gen_ai.usage.cache_creation.input_tokens": 0,
        "gen_ai.usage.output_tokens": 50,
        "gen_ai.usage.reasoning.output_tokens": 50,
      },
      {},
      "recommended",
    );

    const points = await collectTokenUsagePoints();

    const inputPoints = points.filter((p) => p.attributes["gen_ai.token.type"] === "input");
    expect(inputPoints).toHaveLength(1);
    expect(inputPoints[0]).toEqual({
      value: 100,
      attributes: { "gen_ai.token.type": "input", "gen_ai.token.cache": "read" },
    });

    const outputPoints = points.filter((p) => p.attributes["gen_ai.token.type"] === "output");
    expect(outputPoints).toHaveLength(1);
    expect(outputPoints[0]).toEqual({
      value: 50,
      attributes: { "gen_ai.token.type": "output", "gen_ai.token.reasoning": true },
    });
  });

  test("clamps negative uncached to zero when cache partitions exceed total", async () => {
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 50,
        "gen_ai.usage.cache_read.input_tokens": 40,
        "gen_ai.usage.cache_creation.input_tokens": 20,
      },
      {},
      "recommended",
    );

    const points = await collectTokenUsagePoints();

    const inputPoints = points.filter((p) => p.attributes["gen_ai.token.type"] === "input");
    expect(inputPoints).toHaveLength(2);
    expect(inputPoints.some((p) => p.attributes["gen_ai.token.cache"] === "uncached")).toBe(false);
  });

  test("does nothing for off/required signal level", async () => {
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 50,
      },
      {},
      "off",
    );
    recordTokenUsage(
      {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.output_tokens": 50,
      },
      {},
      "required",
    );

    const points = await collectTokenUsagePoints();
    expect(points).toHaveLength(0);
  });
});

describe("telemetry/gen-ai feature counters", () => {
  const baseAttrs: Attributes = {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "groq",
    "gen_ai.response.model": "openai/gpt-oss-20b",
  };

  test("no-ops when signal level is off or missing", async () => {
    const undef: "off" | undefined = undefined;
    recordFeatureOutcome("tool_call", baseAttrs, undefined, "off");
    recordFeatureOutcome("tool_call", baseAttrs, undefined, undef);
    recordFeatureOutcome("structured_output", baseAttrs, undefined, "off");
    recordAiSdkFeatureError(new NoSuchToolError({ toolName: "x" }), baseAttrs, "off");

    expect(await collectCounterPoints("gen_ai.server.tool_call")).toHaveLength(0);
    expect(await collectCounterPoints("gen_ai.server.structured_output")).toHaveLength(0);
  });

  test("no-ops when signal level is 'required'", async () => {
    recordFeatureOutcome("tool_call", baseAttrs, undefined, "required");
    recordFeatureOutcome("structured_output", baseAttrs, undefined, "required");

    expect(await collectCounterPoints("gen_ai.server.tool_call")).toHaveLength(0);
    expect(await collectCounterPoints("gen_ai.server.structured_output")).toHaveLength(0);
  });

  test("records tool_call success with no error.type attribute", async () => {
    recordFeatureOutcome("tool_call", baseAttrs, undefined, "recommended");

    const points = await collectCounterPoints("gen_ai.server.tool_call");
    expect(points).toHaveLength(1);
    expect(points[0]!.value).toBe(1);
    expect(points[0]!.attributes["error.type"]).toBeUndefined();
    expect(points[0]!.attributes["gen_ai.provider.name"]).toBe("groq");
  });

  test("records structured_output success with no error.type attribute", async () => {
    recordFeatureOutcome("structured_output", baseAttrs, undefined, "full");

    const points = await collectCounterPoints("gen_ai.server.structured_output");
    expect(points).toHaveLength(1);
    expect(points[0]!.attributes["error.type"]).toBeUndefined();
  });

  test("recordAiSdkFeatureError maps tool SDK errors to tool_call counter", async () => {
    recordAiSdkFeatureError(
      new InvalidToolInputError({ toolName: "x", toolInput: "{", cause: new Error("bad") }),
      baseAttrs,
      "recommended",
    );
    recordAiSdkFeatureError(new NoSuchToolError({ toolName: "y" }), baseAttrs, "recommended");
    recordAiSdkFeatureError(
      new ToolCallRepairError({
        cause: new Error("oops"),
        originalError: new NoSuchToolError({ toolName: "y" }),
      }),
      baseAttrs,
      "recommended",
    );

    const points = await collectCounterPoints("gen_ai.server.tool_call");
    const typeCounts = new Map<string, number>();
    for (const p of points) {
      const t = String(p.attributes["error.type"] ?? "<none>");
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + p.value);
    }
    expect(typeCounts.get("invalid_input")).toBe(1);
    expect(typeCounts.get("unknown_tool")).toBe(1);
    expect(typeCounts.get("repair_failed")).toBe(1);
  });

  test("recordAiSdkFeatureError maps output SDK errors to structured_output counter", async () => {
    recordAiSdkFeatureError(
      new JSONParseError({ text: "{", cause: new Error("parse") }),
      baseAttrs,
      "recommended",
    );
    recordAiSdkFeatureError(
      new TypeValidationError({ value: {}, cause: new Error("schema") }),
      baseAttrs,
      "recommended",
    );
    recordAiSdkFeatureError(
      new NoObjectGeneratedError({
        message: "no output",
        response: { id: "r", modelId: "m", timestamp: new Date() },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
        },
        finishReason: "stop",
      }),
      baseAttrs,
      "recommended",
    );

    const points = await collectCounterPoints("gen_ai.server.structured_output");
    const types = points.map((p) => p.attributes["error.type"]);
    expect(types).toContain("invalid_json");
    expect(types).toContain("schema_mismatch");
    expect(types).toContain("no_output");
  });

  test("recordAiSdkFeatureError no-ops for unrelated errors", async () => {
    recordAiSdkFeatureError(new Error("just a regular error"), baseAttrs, "recommended");

    expect(await collectCounterPoints("gen_ai.server.tool_call")).toHaveLength(0);
    expect(await collectCounterPoints("gen_ai.server.structured_output")).toHaveLength(0);
  });
});

describe("getGenAiGeneralAttributes", () => {
  const baseCtx = {
    state: {},
    otel: {},
    providers: {} as GatewayContext["providers"],
    models: {} as GatewayContext["models"],
    request: new Request("https://example.test/"),
    requestId: "req_1",
    body: { model: "m" } as GatewayContext["body"],
    operation: "chat" as GatewayContext["operation"],
    resolvedModelId: "m",
    resolvedProviderId: "p",
  } satisfies GatewayContext;

  test("defaults service_tier to 'auto' when the request body omits it", () => {
    const attrs = getGenAiGeneralAttributes(baseCtx, "recommended");
    expect(attrs["gen_ai.request.service_tier"]).toBe("auto");
  });

  test("emits the requested service_tier when the body provides one", () => {
    const ctx: GatewayContext = {
      ...baseCtx,
      body: { ...baseCtx.body, service_tier: "priority" } as GatewayContext["body"],
    };
    const attrs = getGenAiGeneralAttributes(ctx, "recommended");
    expect(attrs["gen_ai.request.service_tier"]).toBe("priority");
  });

  test("omits service_tier at 'required' signal level", () => {
    const attrs = getGenAiGeneralAttributes(baseCtx, "required");
    expect(attrs["gen_ai.request.service_tier"]).toBeUndefined();
  });
});
