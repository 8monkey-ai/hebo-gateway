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

// FUTURE: always return a wrapped GatewayError?
export function getErrorMeta(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  let status: number;
  let code: string;

  if (error instanceof GatewayError) {
    ({ status, code } = error);
  } else {
    const normalized = normalizeAiSdkError(error);
    if (normalized) {
      ({ status, code } = normalized);
    } else {
      status = 500;
      code = STATUS_CODE(status);
    }
  }

  return { status, code, message };
}
