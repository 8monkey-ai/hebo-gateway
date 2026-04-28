import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { metrics, type Attributes } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  InvalidToolInputError,
  JSONParseError,
  NoObjectGeneratedError,
  NoSuchToolError,
  ToolCallRepairError,
  TypeValidationError,
} from "ai";

import {
  recordAiSdkFeatureError,
  recordStructuredOutputOutcome,
  recordToolCallOutcome,
} from "./gen-ai";

const exporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
const reader = new PeriodicExportingMetricReader({
  exporter,
  exportIntervalMillis: 60_000,
});
const meterProvider = new MeterProvider({ readers: [reader] });
metrics.setGlobalMeterProvider(meterProvider);

const baseAttrs: Attributes = {
  "gen_ai.operation.name": "chat",
  "gen_ai.provider.name": "groq",
  "gen_ai.response.model": "openai/gpt-oss-20b",
};

async function collectPoints(metricName: string) {
  await reader.forceFlush();
  const all = exporter.getMetrics();
  const points: { value: number; attributes: Attributes }[] = [];
  for (const rm of all) {
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
}

describe("telemetry/gen-ai feature counters", () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    await meterProvider.shutdown();
  });

  test("no-ops when signal level is off or missing", async () => {
    const undef: "off" | undefined = undefined;
    recordToolCallOutcome(baseAttrs, undefined, "off");
    recordToolCallOutcome(baseAttrs, undefined, undef);
    recordStructuredOutputOutcome(baseAttrs, undefined, "off");
    recordAiSdkFeatureError(new NoSuchToolError({ toolName: "x" }), baseAttrs, "off");

    expect(await collectPoints("gen_ai.server.tool_call")).toHaveLength(0);
    expect(await collectPoints("gen_ai.server.structured_output")).toHaveLength(0);
  });

  test("no-ops when signal level is 'required'", async () => {
    recordToolCallOutcome(baseAttrs, undefined, "required");
    recordStructuredOutputOutcome(baseAttrs, undefined, "required");

    expect(await collectPoints("gen_ai.server.tool_call")).toHaveLength(0);
    expect(await collectPoints("gen_ai.server.structured_output")).toHaveLength(0);
  });

  test("records tool_call success with no error.type attribute", async () => {
    recordToolCallOutcome(baseAttrs, undefined, "recommended");

    const points = await collectPoints("gen_ai.server.tool_call");
    expect(points).toHaveLength(1);
    expect(points[0]!.value).toBe(1);
    expect(points[0]!.attributes["error.type"]).toBeUndefined();
    expect(points[0]!.attributes["gen_ai.provider.name"]).toBe("groq");
  });

  test("records structured_output success with no error.type attribute", async () => {
    recordStructuredOutputOutcome(baseAttrs, undefined, "full");

    const points = await collectPoints("gen_ai.server.structured_output");
    expect(points).toHaveLength(1);
    expect(points[0]!.attributes["error.type"]).toBeUndefined();
  });

  test("recordAiSdkFeatureError maps tool SDK errors to tool_call counter", async () => {
    recordAiSdkFeatureError(
      new InvalidToolInputError({ toolName: "x", toolInput: "{" }),
      baseAttrs,
      "recommended",
    );
    recordAiSdkFeatureError(new NoSuchToolError({ toolName: "y" }), baseAttrs, "recommended");
    recordAiSdkFeatureError(
      new ToolCallRepairError({ cause: new Error("oops"), originalError: new Error("orig") }),
      baseAttrs,
      "recommended",
    );

    const points = await collectPoints("gen_ai.server.tool_call");
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
        cause: undefined,
        text: undefined,
        response: undefined,
        usage: undefined,
        finishReason: undefined,
      }),
      baseAttrs,
      "recommended",
    );

    const points = await collectPoints("gen_ai.server.structured_output");
    const types = points.map((p) => p.attributes["error.type"]);
    expect(types).toContain("invalid_json");
    expect(types).toContain("schema_mismatch");
    expect(types).toContain("no_output");
  });

  test("recordAiSdkFeatureError no-ops for unrelated errors", async () => {
    recordAiSdkFeatureError(new Error("just a regular error"), baseAttrs, "recommended");

    expect(await collectPoints("gen_ai.server.tool_call")).toHaveLength(0);
    expect(await collectPoints("gen_ai.server.structured_output")).toHaveLength(0);
  });
});
