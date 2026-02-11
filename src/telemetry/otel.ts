import type { Tracer } from "@opentelemetry/api";

import type { GatewayConfig } from "../types";

export const toAiSdkTelemetry = (
  config: GatewayConfig,
  functionId: string,
): { isEnabled: boolean; tracer?: Tracer; functionId?: string } => ({
  isEnabled: config.telemetry?.enabled ?? false,
  tracer: config.telemetry?.tracer,
  functionId,
});
