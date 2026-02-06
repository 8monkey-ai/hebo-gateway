import type { GatewayContext } from "../types";

import { isProduction } from "./env";

export type LogFn = {
  (msg: string): void;
  (obj: Record<string, unknown>, msg?: string): void;
  (err: Error, msg?: string): void;
  (err: Error, obj?: Record<string, unknown>, msg?: string): void;
};

export type Logger = {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
};

export const getDefaultLogLevel = (): "debug" | "info" => (isProduction() ? "info" : "debug");

export type LogLevel = ReturnType<typeof getDefaultLogLevel> | "warn" | "error" | "silent";

const KEY = Symbol.for("@hebo/logger");
const KEY_CONFIG = Symbol.for("@hebo/logger.config");
const KEY_EXTERNAL = Symbol.for("@hebo/logger.external");

type GlobalWithLogger = typeof globalThis & {
  [KEY]?: Logger;
  [KEY_CONFIG]?: {
    disabled?: boolean;
    level?: LogLevel;
  };
  [KEY_EXTERNAL]?: boolean;
};

const defaultLogger = console satisfies Logger;
const noop: LogFn = () => {};
const levelOrder = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as Record<Exclude<LogLevel, "silent">, number>;

const g = globalThis as GlobalWithLogger;

const defaultLevel: LogLevel = getDefaultLogLevel();

export const getLoggerConfig = () => ({ ...g[KEY_CONFIG] });

g[KEY] ??= defaultLogger;
g[KEY_CONFIG] ??= { disabled: false, level: defaultLevel };
g[KEY_EXTERNAL] ??= false;

const wrapLogger = (base: Logger, config: { disabled?: boolean; level?: LogLevel }): Logger => {
  if (config.disabled === true || config.level === "silent") {
    return { debug: noop, info: noop, warn: noop, error: noop };
  }

  const threshold = levelOrder[config.level ?? getDefaultLogLevel()];

  const debugEnabled = levelOrder.debug >= threshold;
  const infoEnabled = levelOrder.info >= threshold;
  const warnEnabled = levelOrder.warn >= threshold;
  const errorEnabled = levelOrder.error >= threshold;

  return {
    debug: debugEnabled ? base.debug : noop,
    info: infoEnabled ? base.info : noop,
    warn: warnEnabled ? base.warn : noop,
    error: errorEnabled ? base.error : noop,
  };
};

export let logger: Logger = wrapLogger(g[KEY], g[KEY_CONFIG]);

export function setLogger(next: Logger) {
  g[KEY] = next;
  g[KEY_EXTERNAL] = true;
  logger = next;
  logger.info(`[logger] custom logger configured`);
}

export function setLoggerConfig(next: { disabled?: boolean; level?: LogLevel }) {
  g[KEY_CONFIG] = { ...g[KEY_CONFIG], ...next };
  if (g[KEY_EXTERNAL]) return;
  logger = wrapLogger(g[KEY] ?? defaultLogger, g[KEY_CONFIG]);
  const current = getLoggerConfig();
  logger.info(
    `[logger] default logger configured: level=${current.level} disabled=${current.disabled}`,
  );
}

const getHeader = (headers: Headers, name: string) => headers.get(name) ?? undefined;

export const getRequestMeta = (request?: Request): Record<string, unknown> => {
  if (!request) return {};

  let path = request.url;
  let query: string | undefined;
  try {
    const url = new URL(request.url);
    path = url.pathname;
    query = url.search || undefined;
  } catch {
    path = request.url;
  }

  const headers = request.headers;
  return {
    method: request.method,
    path,
    query,
    contentType: getHeader(headers, "content-type"),
    contentLength: getHeader(headers, "content-length"),
    userAgent: getHeader(headers, "user-agent"),
  };
};

export const getAIMeta = (context?: Partial<GatewayContext>): Record<string, unknown> => {
  if (!context) return {};

  return {
    modelId: context.modelId,
    resolvedModelId: context.resolvedModelId,
    resolvedProviderId: context.resolvedProviderId,
  };
};

export const getResponseMeta = (response?: Response): Record<string, unknown> => {
  if (!response) return {};

  const headers = response.headers;
  return {
    status: response.status,
    statusText: response.statusText,
    contentType: getHeader(headers, "content-type"),
    contentLength: getHeader(headers, "content-length"),
  };
};
