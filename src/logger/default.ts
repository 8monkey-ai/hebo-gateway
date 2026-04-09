import { isProduction, isTest } from "../utils/env";
import type { LogArgs, LogFn, LogLevel, Logger } from "./index";

const getDefaultLogLevel = (): LogLevel =>
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

function serializeError(err: unknown, _seen?: WeakSet<object>): Record<string, unknown> {
  if (!(err instanceof Error)) return { message: String(err) };

  const seen = _seen ?? new WeakSet();
  if (seen.has(err)) return { name: err.name, message: err.message, circular: true };
  seen.add(err);

  const out: Record<string, unknown> = {};

  for (const k of Object.getOwnPropertyNames(err)) {
    if (k.startsWith("_")) continue;

    let val: unknown;
    try {
      val = (err as unknown as Record<string, unknown>)[k];
    } catch {
      val = "[Unreadable]";
    }

    if (typeof val === "bigint") val = `${val}n`;

    // FUTURE: check for circular references within val
    out[k] = val instanceof Error ? serializeError(val, seen) : val;
  }

  return out;
}

const buildLogObject = (level: LogLevel, args: LogArgs): Record<string, unknown> => {
  const [first, second] = args;

  let obj: Record<string, unknown> | undefined;
  let err: Record<string, unknown> | undefined;
  let msg: string | undefined;

  if (first instanceof Error) {
    err = serializeError(first);
  } else if (isRecord(first)) {
    if (first["err"] !== undefined) {
      err = serializeError(first["err"]);
      delete first["err"];
    }
    obj = first;
  } else {
    msg = first;
  }

  if (second !== undefined) {
    msg = second;
  }

  if (err && msg === undefined) {
    msg = err["message"] as string;
  }

  return {
    level,
    time: Date.now(),
    ...(msg ? { msg } : {}),
    ...(err ? { err } : {}),
    ...obj,
  };
};

const makeLogFn =
  (level: LogLevel, write: (line: string) => void): LogFn =>
  (...args: LogArgs) => {
    write(JSON.stringify(buildLogObject(level, args)));
  };

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
