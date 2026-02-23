import type { LogWarningsFunction } from "ai";

import type { TelemetrySignalLevel } from "../types";

import { logger } from "../logger";
import { addSpanEvent, setSpanAttributes } from "./span";

type GlobalWithAiSdkWarningLogger = typeof globalThis & {
  AI_SDK_LOG_WARNINGS?: LogWarningsFunction | false;
};

export const installAiSdkWarningLogger = (genAiSignalLevel?: TelemetrySignalLevel) => {
  const logWarnings: LogWarningsFunction = ({ warnings, provider, model }) => {
    if (warnings.length === 0) return;

    for (const warning of warnings) {
      logger.warn(
        {
          provider,
          model,
          warning,
        },
        `[ai-sdk] ${warning.type}`,
      );
    }

    if (!(genAiSignalLevel === "recommended" || genAiSignalLevel === "full")) return;

    setSpanAttributes({
      "gen_ai.response.warning_count": warnings.length,
    });

    for (const warning of warnings) {
      addSpanEvent("gen_ai.warning", {
        "gen_ai.provider.name": provider,
        "gen_ai.response.model": model,
        "gen_ai.warning.type": warning.type,
        "gen_ai.warning.feature": "feature" in warning ? warning.feature : undefined,
        "gen_ai.warning.details": "details" in warning ? warning.details : undefined,
        "gen_ai.warning.message": "message" in warning ? warning.message : undefined,
      });
    }
  };

  (globalThis as GlobalWithAiSdkWarningLogger).AI_SDK_LOG_WARNINGS = logWarnings;
};
