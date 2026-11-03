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
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  499: "CLIENT_CLOSED_REQUEST",
  500: "INTERNAL_SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
} as const;

export const STATUS_TEXT = (status: number) => {
  const label = STATUS_CODES[status as keyof typeof STATUS_CODES];
  if (label) return label;
  return status >= 400 && status < 500 ? STATUS_CODES[400] : STATUS_CODES[500];
};

export type ErrorMeta = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
};

export function getErrorMeta(error: unknown): ErrorMeta {
  let status: number;
  let statusText: string;
  let headers: Record<string, string> | undefined;

  if (error instanceof GatewayError) {
    ({ status, statusText, headers } = error);
  } else {
    const normalized = normalizeAiSdkError(error);
    if (normalized) {
      ({ status, statusText, headers } = normalized);
    } else {
      // Honor `status` on foreign HTTP errors (e.g. framework NotFound errors), else 500.
      const foreign = (error as { status?: unknown } | null | undefined)?.status;
      status = isErrorStatus(foreign) ? foreign : 500;
      statusText = STATUS_TEXT(status);
      headers = {};
    }
  }

  return { status, statusText, headers: headers ?? {} };
}

const isErrorStatus = (status: unknown): status is number =>
  typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599;

/**
 * Resolves the `ResponseInit` for an error response so that the HTTP status always
 * matches the error body: explicit `init.status` (if 4xx/5xx) → error status → 500.
 */
export function resolveErrorResponseInit(
  error: unknown,
  init?: ResponseInit,
): ResponseInit & { status: number; statusText: string } {
  let status: number;
  let statusText: string;

  if (isErrorStatus(init?.status)) {
    status = init.status;
    statusText =
      init.statusText === undefined || init.statusText === ""
        ? STATUS_TEXT(status)
        : init.statusText;
  } else {
    ({ status, statusText } = getErrorMeta(error));
  }

  return init?.headers ? { status, statusText, headers: init.headers } : { status, statusText };
}

export function maybeMaskMessage(message: string, status: number, requestId?: string): string {
  // FUTURE: consider masking all upstream errors, also 4xx
  if (!(isProduction() && status >= 500)) {
    return message;
  }
  // FUTURE: always attach requestId to errors (masked and unmasked)
  return `${STATUS_TEXT(status)} (${requestId ?? "see requestId in response headers"})`;
}
