import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type HistogramMetricData,
} from "@opentelemetry/sdk-metrics";

import { recordTokenUsage } from "./gen-ai";

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

describe("recordTokenUsage", () => {
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
