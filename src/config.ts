import { InMemoryStorage } from "./endpoints/conversations/storage/memory";
import { isLogger, logger, setLoggerInstance } from "./logger";
import { createDefaultLogger } from "./logger/default";
import { installAiSdkWarningLogger } from "./telemetry/ai-sdk";
import {
  DEFAULT_CHAT_TIMEOUT_MS,
  kParsed,
  type GatewayConfig,
  type GatewayConfigParsed,
  type TelemetrySignalLevel,
} from "./types";
import { DEFAULT_MAX_BODY_SIZE } from "./utils/body";
import { FORWARD_HEADER_ALLOWLIST } from "./utils/request";

export const parseConfig = (config: GatewayConfig): GatewayConfigParsed => {
  // If it has been parsed before, just return.
  if (kParsed in config) return config as GatewayConfigParsed;

  const providers = config.providers ?? {};
  const parsedProviders = {} as typeof providers;
  const models = config.models ?? {};
  const storage = config.storage ?? new InMemoryStorage();

  // Set the global logger instance.
  if (config.logger === undefined) {
    setLoggerInstance(createDefaultLogger({}));
  } else if (config.logger !== null) {
    setLoggerInstance(isLogger(config.logger) ? config.logger : createDefaultLogger(config.logger));

    logger.info(
      isLogger(config.logger)
        ? `[logger] custom logger configured`
        : `[logger] logger configured: level=${config.logger.level}`,
    );
  }

  // Strip providers that are not configured.
  for (const id in providers) {
    const provider = providers[id];
    if (provider === undefined) {
      logger.warn(`[config] ${id} provider removed (undefined)`);
      continue;
    }
    parsedProviders[id] = provider;
  }

  if (Object.keys(parsedProviders).length === 0) {
    throw new Error("No providers configured (config.providers is empty)");
  }

  // Strip providers that are not configured from models.
  const parsedModels = {} as typeof models;
  const warnings = new Set<string>();
  for (const id in models) {
    const model = models[id]!;

    const kept: string[] = [];

    for (const p of model.providers) {
      if (p in parsedProviders) kept.push(p);
      else warnings.add(p);
    }

    if (kept.length > 0) parsedModels[id] = { ...model, providers: kept };
  }
  for (const warning of warnings) {
    logger.warn(`[config] ${warning} provider removed (not configured)`);
  }

  if (Object.keys(parsedModels).length === 0) {
    throw new Error("No models configured (config.models is empty)");
  }

  // Default for the telemetry settings.
  const telemetryEnabled = config.telemetry?.enabled ?? false;
  const telemetrySignals: Record<"http" | "gen_ai" | "hebo", TelemetrySignalLevel> =
    telemetryEnabled
      ? {
          http: config.telemetry?.signals?.http ?? "recommended",
          gen_ai: config.telemetry?.signals?.gen_ai ?? "full",
          hebo: config.telemetry?.signals?.hebo ?? "off",
        }
      : {
          http: "off",
          gen_ai: "off",
          hebo: "off",
        };

  installAiSdkWarningLogger(telemetrySignals.gen_ai);

  // Default timeouts
  let normal: number | undefined;
  let flex: number | undefined;

  const t = config.advanced?.timeouts;
  if (t === null) {
    normal = flex = undefined;
  } else if (typeof t === "number") {
    normal = t;
    flex = t * 3;
  } else {
    if (t?.normal === null) normal = undefined;
    else if (t?.normal === undefined) normal = DEFAULT_CHAT_TIMEOUT_MS;
    else normal = t.normal;

    if (t?.flex === null) flex = undefined;
    else if (t?.flex === undefined) flex = normal === undefined ? undefined : normal * 3;
    else flex = t.flex;
  }

  const parsedTimeouts = { normal, flex };

  // Body size limit
  const rawMax = config.advanced?.maxBodySize;
  let maxBodySize: number;
  if (typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax >= 0) {
    maxBodySize = rawMax;
  } else {
    maxBodySize = DEFAULT_MAX_BODY_SIZE;
    if (rawMax !== undefined) {
      logger.warn(
        `[config] invalid maxBodySize (${rawMax}), using default ${DEFAULT_MAX_BODY_SIZE}`,
      );
    }
  }

  // Merge forward header allowlist once.
  const customHeaders = config.advanced?.forwardHeaders;
  const forwardHeaders =
    customHeaders && customHeaders.length > 0
      ? Array.from(
          new Set([
            ...FORWARD_HEADER_ALLOWLIST,
            ...customHeaders.map((h) => {
              const normalized = h.trim().toLowerCase();
              try {
                const probe = new Headers([[normalized, ""]]);
                void probe;
              } catch {
                throw new Error(
                  `[config] invalid advanced.forwardHeaders entry: ${JSON.stringify(h)}`,
                );
              }
              return normalized;
            }),
          ]),
        )
      : [...FORWARD_HEADER_ALLOWLIST];

  // Return parsed config.
  return {
    ...config,
    advanced: {
      timeouts: parsedTimeouts,
      maxBodySize,
      forwardHeaders,
    },
    telemetry: {
      ...config.telemetry,
      enabled: telemetryEnabled,
      signals: telemetrySignals,
    },
    providers: parsedProviders,
    models: parsedModels,
    storage,
    [kParsed]: true,
  };
};
