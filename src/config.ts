import { kParsed, type GatewayConfig, type GatewayConfigParsed } from "./types";

export const parseConfig = (config: GatewayConfig): GatewayConfigParsed => {
  // If it has been parsed before, just return
  if (kParsed in config) return config as GatewayConfigParsed;

  const providers = config.providers ?? {};
  const parsedProviders = {} as typeof providers;
  const models = config.models ?? {};

  // Strip providers that are not configured
  for (const id in providers) {
    const provider = providers[id];
    if (provider === undefined) {
      console.warn(`[providers] ${id}: provider "${id}" removed (undefined)`);
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
      else console.warn(`[models] ${id}: provider "${p}" removed (not configured)`);
    }

    if (kept.length > 0) parsedModels[id] = { ...model!, providers: kept };
  }

  if (Object.keys(parsedModels).length === 0) {
    throw new Error("Gateway config error: no models configured (config.models is empty).");
  }

  return { ...config, providers: parsedProviders, models: parsedModels, [kParsed]: true };
};
