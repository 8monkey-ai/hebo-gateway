import type { Attributes } from "@opentelemetry/api";

import { type GatewayContext, type TelemetrySignalLevel } from "../../types";

export const getConversationGeneralAttributes = (
  ctx: GatewayContext,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  return {
    "gen_ai.operation.name": ctx.operation,
  };
};

export const getConversationAttributes = (
  conversationId: string,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  return {
    "hebo.conversation.id": conversationId,
  };
};

export const getItemAttributes = (
  itemId: string,
  signalLevel?: TelemetrySignalLevel,
): Attributes => {
  if (!signalLevel || signalLevel === "off") return {};

  return {
    "hebo.conversation.item.id": itemId,
  };
};
