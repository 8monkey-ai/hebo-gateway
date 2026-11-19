import { expect, test } from "bun:test";

import type { LanguageModelMiddleware } from "ai";

import type { ModelSpec } from "../models/types.ts";
import { defineSpecMiddleware, modelMiddlewareMatcher } from "./matcher.ts";

const built: ModelSpec[] = [];
const specMiddleware = defineSpecMiddleware((spec): LanguageModelMiddleware => {
  built.push(spec);
  return { specificationVersion: "v3" };
});

modelMiddlewareMatcher.useForModel("test-spec/*", { language: [specMiddleware] });

test("defineSpecMiddleware > builds once per spec", () => {
  const spec: ModelSpec = { output: 1000 };
  expect(specMiddleware(spec)).toBe(specMiddleware(spec));
  expect(specMiddleware()).toBe(specMiddleware());
  expect(specMiddleware(spec)).not.toBe(specMiddleware());
});

test("modelMiddlewareMatcher > builds spec middleware from the spec it is given", () => {
  const a: ModelSpec = { output: 1 };
  const b: ModelSpec = { output: 2 };
  const resolve = (spec?: ModelSpec) =>
    modelMiddlewareMatcher.resolve({ kind: "text", modelId: "test-spec/m", spec });

  const chain = resolve(a);
  expect(chain).toEqual([specMiddleware(a)]);
  // Cached for the same spec, rebuilt for another one.
  expect(resolve(a)).toBe(chain);
  expect(resolve(b)).toEqual([specMiddleware(b)]);
  expect(resolve()).toEqual([specMiddleware()]);
  expect(built).toContain(a);
  expect(built).toContain(b);
});
