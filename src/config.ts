import type { ProviderV3 } from "@ai-sdk/provider";

import { createProviderRegistry, type ProviderRegistryProvider } from "ai";

import { kParsed, type GatewayConfig, type GatewayConfigParsed } from "./types";

export const parseConfig = (config: GatewayConfig): GatewayConfigParsed => {
  // If it has been parsed before, just return
  if (kParsed in config) return config as GatewayConfigParsed;

  const providers = config.providers ?? {};
  const models = config.models ?? {};

  if (Object.keys(providers).length === 0) {
    throw new Error("Gateway config error: no providers configured (config.providers is empty).");
  }

  // Initialize ProviderRegistry (if nessecary)
  let registry;
  if ("languageModel" in providers) {
    registry = providers as unknown as ProviderRegistryProvider;
  } else {
    registry = createProviderRegistry(providers as unknown as Record<string, ProviderV3>);
  }

  // Strip out providers from models that are not configured
  const providerKeys = Object.keys(
    (registry as unknown as { providers: Record<string, unknown> }).providers,
  );

  const parsedModels = {} as typeof models;
  for (const id in models) {
    const model = models[id!];

    const kept: string[] = [];

    for (const p of model!.providers) {
      if (providerKeys.includes(p)) kept.push(p);
      else console.warn(`[models] ${id}: provider "${p}" removed (not configured)`);
    }

    if (kept.length > 0) parsedModels[id] = { ...model!, providers: kept };
  }

  if (Object.keys(parsedModels).length === 0) {
    throw new Error("Gateway config error: no models configured (config.models is empty).");
  }

  return { ...config, providers: registry, models: parsedModels, [kParsed]: true };
};
