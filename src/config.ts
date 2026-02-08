import { kParsed, type GatewayConfig, type GatewayConfigParsed } from "./types";
import { logger, setLogger } from "./utils/logger";

export const parseConfig = (config: GatewayConfig): GatewayConfigParsed => {
  // If it has been parsed before, just return
  if (kParsed in config) return config as GatewayConfigParsed;

  const providers = config.providers ?? {};
  const parsedProviders = {} as typeof providers;
  const models = config.models ?? {};

  const loggerConfig = config.logger;
  if (loggerConfig) {
    setLogger(loggerConfig);
  }

  // Strip providers that are not configured
  for (const id in providers) {
    const provider = providers[id];
    if (provider === undefined) {
      logger.warn(`config: provider removed: ${id} (undefined)`);
      continue;
    }
    parsedProviders[id] = provider;
  }

  if (Object.keys(parsedProviders).length === 0) {
    throw new Error("No providers configured (config.providers is empty).");
  }

  // Strip providers that are not configured from models
  const parsedModels = {} as typeof models;
  const warnings = new Set<string>();
  for (const id in models) {
    const model = models[id!];

    const kept: string[] = [];

    for (const p of model!.providers) {
      if (p in parsedProviders) kept.push(p);
      else warnings.add(p);
    }

    if (kept.length > 0) parsedModels[id] = { ...model!, providers: kept };
  }
  for (const warning of warnings) {
    logger.warn(`config: provider removed: ${warning} (not configured)`);
  }

  if (Object.keys(parsedModels).length === 0) {
    throw new Error("No models configured (config.models is empty).");
  }

  return {
    ...config,
    logger: config.logger,
    providers: parsedProviders,
    models: parsedModels,
    [kParsed]: true,
  };
};
