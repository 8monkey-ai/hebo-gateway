export type LogFn = {
  (msg: string): void;
  (obj: Record<string, unknown>, msg?: string): void;
  (err: Error, msg?: string): void;
  (err: Error, obj?: Record<string, unknown>, msg?: string): void;
};

export type Logger = Record<"trace" | "debug" | "info" | "warn" | "error", LogFn>;
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";
export type LoggerConfig = { level?: LogLevel };
export type LoggerInput = Logger | LoggerConfig;

const KEY = Symbol.for("@hebo/logger");
type GlobalWithLogger = typeof globalThis & {
  [KEY]?: Logger;
};
const g = globalThis as GlobalWithLogger;

g[KEY] ??= {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export let logger: Logger = g[KEY];

export const isLogger = (input: LoggerInput): input is Logger =>
  typeof input === "object" && input !== null && "info" in input;

export function isLoggerDisabled(input?: LoggerInput | null): boolean {
  if (!input) return true;
  if (typeof input !== "object" || "info" in input) return false;
  return input.level === "silent";
}

export function setLoggerInstance(next: Logger) {
  g[KEY] = next;
  logger = g[KEY];
}
