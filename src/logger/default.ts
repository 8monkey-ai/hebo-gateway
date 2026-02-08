import { serializeError } from "serialize-error";

import type { LogFn, LogLevel, Logger } from "./index";

import { isProduction } from "../utils/env";

export const getDefaultLogLevel = (): "debug" | "info" => (isProduction() ? "info" : "debug");

const noop: LogFn = () => {};

const LEVEL = {
  trace: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const LEVELS = Object.keys(LEVEL) as (keyof typeof LEVEL)[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !(value instanceof Error);

const buildLogObject = (level: LogLevel, args: unknown[]): Record<string, unknown> => {
  if (args.length === 0) return {};

  const [first, second, third] = args;
  let obj: Record<string, unknown> | undefined;
  let err: Error | undefined;
  let msg: string | undefined;

  if (first instanceof Error) {
    err = first;
    if (isRecord(second)) {
      obj = second;
      if (typeof third !== "undefined") {
        msg = String(third);
      }
    } else if (typeof second !== "undefined") {
      msg = String(second);
    }
  } else if (isRecord(first)) {
    obj = first;
    if (typeof second !== "undefined") {
      msg = String(second);
    }
  } else {
    msg = String(first);
  }

  if (err && typeof msg === "undefined") {
    msg = err.message;
  }

  const out: Record<string, unknown> = obj ?? {};
  out["level"] = level;
  out["time"] = Date.now();
  if (typeof msg !== "undefined") {
    out["msg"] = msg;
  }
  if (err) {
    out["err"] = serializeError(err);
  }
  return out;
};

const makeLogFn =
  (level: LogLevel, write: (line: string) => void): LogFn =>
  (...args: unknown[]) =>
    write(JSON.stringify(buildLogObject(level, args)));

export const createDefaultLogger = (config: { level?: LogLevel }): Logger => {
  if (config.level === "silent") {
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
  }

  const threshold = LEVEL[config.level ?? getDefaultLogLevel()];
  const enabled = (lvl: keyof typeof LEVEL) => LEVEL[lvl] >= threshold;

  return Object.fromEntries(
    LEVELS.map((lvl) => [lvl, enabled(lvl) ? makeLogFn(lvl, console.log) : noop]),
  ) as Logger;
};
