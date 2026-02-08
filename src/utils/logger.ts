import { isProduction } from "./env";

export type LogFn = {
  (msg: string): void;
  (obj: Record<string, unknown>, msg?: string): void;
  (err: Error, msg?: string): void;
  (err: Error, obj?: Record<string, unknown>, msg?: string): void;
};

export type Logger = Record<"trace" | "debug" | "info" | "warn" | "error", LogFn>;
export type LoggerConfig = { level?: LogLevel };

export const getDefaultLogLevel = (): "debug" | "info" => (isProduction() ? "info" : "debug");

const KEY = Symbol.for("@hebo/logger");
type GlobalWithLogger = typeof globalThis & {
  [KEY]?: Logger;
};
const g = globalThis as GlobalWithLogger;

const noop: LogFn = () => {};

const LEVEL = {
  trace: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const LEVELS = Object.keys(LEVEL) as (keyof typeof LEVEL)[];
type LogLevel = keyof typeof LEVEL | "silent";

const isLogger = (input: Logger | LoggerConfig): input is Logger =>
  typeof input === "object" && input !== null && "info" in input;

const createDefaultLogger = (config: { level?: LogLevel }): Logger => {
  if (config.level === "silent") {
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
  }

  const threshold = LEVEL[config.level ?? getDefaultLogLevel()];
  const enabled = (lvl: keyof typeof LEVEL) => LEVEL[lvl] >= threshold;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !(value instanceof Error);

  const buildLogObject = async (
    level: LogLevel,
    args: unknown[],
  ): Promise<Record<string, unknown>> => {
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
      const { serializeError } = await import("serialize-error");
      out["err"] = serializeError(err);
    }
    return out;
  };

  const makeLogFn =
    (level: LogLevel, write: (line: string) => void): LogFn =>
    async (...args: unknown[]) =>
      write(JSON.stringify(await buildLogObject(level, args)));

  return Object.fromEntries(
    LEVELS.map((lvl) => [lvl, enabled(lvl) ? makeLogFn(lvl, console.log) : noop]),
  ) as Logger;
};

g[KEY] ??= createDefaultLogger({});

export let logger: Logger = g[KEY];

export function setLogger(next: Logger | LoggerConfig) {
  if (isLogger(next)) {
    g[KEY] = next;
    logger = g[KEY];
    logger.info(`[logger] custom logger configured`);
    return;
  }

  g[KEY] = createDefaultLogger(next);
  logger = g[KEY];
  logger.info(`[logger] default logger configured: level=${next.level}`);
}

export function isLoggerDisabled(input?: Logger | LoggerConfig | null): boolean {
  if (!input) return true;
  if (typeof input !== "object" || "info" in input) return false;
  return input.level === "silent";
}
