export type LogFn = {
  (obj: Record<string, unknown>, msg?: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
};

export type Logger = {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
};

const KEY = Symbol.for("@hebo/logger");

type GlobalWithLogger = typeof globalThis & {
  [KEY]?: Logger;
};

const defaultLogger = console satisfies Logger;

const g = globalThis as GlobalWithLogger;

g[KEY] ??= defaultLogger;

export let logger: Logger = g[KEY];

export function setLogger(next: Logger) {
  g[KEY] = next;
  logger = next;
}
