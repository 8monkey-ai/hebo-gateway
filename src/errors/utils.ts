import { isProduction } from "../utils/env";
import { normalizeAiSdkError } from "./ai-sdk";
import { GatewayError } from "./gateway";

export const STATUS_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  402: "PAYMENT_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
} as const;

export const STATUS_CODE = (status: number) => {
  const label = STATUS_CODES[status as keyof typeof STATUS_CODES];
  if (label) return label;
  return status >= 400 && status < 500 ? STATUS_CODES[400] : STATUS_CODES[500];
};

export function getErrorMeta(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);

  let code: string;
  let status: number;
  let param = "";

  if (error instanceof GatewayError) {
    ({ code, status } = error);
  } else {
    const normalized = normalizeAiSdkError(error);
    if (normalized) {
      ({ code, status } = normalized);
    } else {
      status = 500;
      code = STATUS_CODE(status);
    }
  }

  const type = status < 500 ? "invalid_request_error" : "server_error";
  const shouldMask = !code.includes("UPSTREAM") && status >= 500 && isProduction();
  const message = shouldMask ? STATUS_CODE(status) : rawMessage;

  return { code, status, param, type, message, rawMessage };
}
