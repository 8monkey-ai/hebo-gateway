import { kParsed, type GatewayConfig, type GatewayConfigParsed } from "./types";
import { logger, setLogger, setLoggerConfig } from "./utils/logger";

export const parseConfig = (config: GatewayConfig): GatewayConfigParsed => {
  // If it has been parsed before, just return
  if (kParsed in config) return config as GatewayConfigParsed;

  const providers = config.providers ?? {};
  const parsedProviders = {} as typeof providers;
  const models = config.models ?? {};

  const logging = config.logging;
  if (logging?.logger) {
    setLogger(logging.logger);
  }

  if (logging?.level || logging?.disabled !== undefined) {
    setLoggerConfig({ level: logging.level, disabled: logging.disabled });
  }

  // Strip providers that are not configured
  for (const id in providers) {
    const provider = providers[id];
    if (provider === undefined) {
      logger.warn({ msg: `[config] provider removed: ${id} (undefined)` });
      continue;
    }
    parsedProviders[id] = provider;
  }

  if (Object.keys(parsedProviders).length === 0) {
    throw new Error("Gateway config error: no providers configured (config.providers is empty).");
  }

  // Strip providers that are not configured from models
  const parsedModels = {} as typeof models;
  for (const id in models) {
    const model = models[id!];

    const kept: string[] = [];

    for (const p of model!.providers) {
      if (p in parsedProviders) kept.push(p);
      else
        logger.warn({
          msg: `[config] provider removed from model: ${id} -> ${p} (not configured)`,
        });
    }

    if (kept.length > 0) parsedModels[id] = { ...model!, providers: kept };
  }

  if (Object.keys(parsedModels).length === 0) {
    throw new Error("Gateway config error: no models configured (config.models is empty).");
  }

  return {
    ...config,
    logging: config.logging,
    providers: parsedProviders,
    models: parsedModels,
    [kParsed]: true,
  };
};
