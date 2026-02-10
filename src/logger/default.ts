import { serializeError } from "serialize-error";

import type { LogFn, LogLevel, Logger } from "./index";

import { isProduction, isTest } from "../utils/env";

export const getDefaultLogLevel = (): LogLevel =>
  isTest() ? "silent" : isProduction() ? "info" : "debug";

const noop: LogFn = () => {};

const LEVEL = {
  trace: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};
const LEVELS = Object.keys(LEVEL) as (keyof typeof LEVEL)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !(value instanceof Error);

const buildLogObject = (level: LogLevel, args: unknown[]): Record<string, unknown> => {
  if (args.length === 0) return {};

  const [first, second] = args;

  let obj: Record<string, unknown> | undefined;
  let err: unknown;
  let msg: string | undefined;

  if (first instanceof Error) {
    err = first;
  } else if (isRecord(first)) {
    if (first["err"] !== undefined) {
      err = first["err"];
      delete first["err"];
    }
    obj = first;
  } else {
    msg = String(first);
  }

  if (second !== undefined) {
    msg = String(second);
  }

  if (err && msg === undefined) {
    msg = err instanceof Error ? err.message : String(err);
  }

  return {
    level,
    time: Date.now(),
    ...(msg ? { msg } : {}),
    ...(err ? { err: err instanceof Error ? serializeError(err) : err } : {}),
    ...obj,
  };
};

const makeLogFn =
  (level: LogLevel, write: (line: string) => void): LogFn =>
  (...args: unknown[]) =>
    write(JSON.stringify(buildLogObject(level, args)));

export const createDefaultLogger = (config: { level?: LogLevel }): Logger => {
  if (config.level === "silent" || getDefaultLogLevel() === "silent") {
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
  }

  const threshold = LEVEL[config.level ?? getDefaultLogLevel()];
  const enabled = (lvl: keyof typeof LEVEL) => LEVEL[lvl] >= threshold;

  return Object.fromEntries(
    LEVELS.map((lvl) => [lvl, enabled(lvl) ? makeLogFn(lvl, console.log) : noop]),
  ) as Logger;
};
