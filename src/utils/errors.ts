import { AISDKError, APICallError } from "ai";
import * as z from "zod";

import { isProduction } from "./env";
import { logger } from "./logger";

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param?: string;

  constructor(message: string, code: string, status: number, param?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.param = param;
  }
}

export const OpenAIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().optional().nullable(),
    param: z.string().optional().nullable(),
  }),
});

export class OpenAIError {
  readonly error;

  constructor(message: string, type: string = "server_error", code?: string, param?: string) {
    this.error = { message, type, code, param };
  }
}

function normalizeAiSdkCallError(error: APICallError): GatewayError {
  let status = error.statusCode ?? (error.isRetryable ? 502 : 422);
  if (error.isRetryable) {
    if (status >= 400 && status < 500 && status !== 429) status = 502;
  } else {
    if (status >= 500) status = 422;
  }

  let code: string;
  if (status === 429) code = "RATE_LIMITED";
  else if (status >= 500) code = "UPSTREAM_SERVER_ERROR";
  else code = "UPSTREAM_INVALID_REQUEST";

  return new GatewayError(error.message, code, status);
}

export function normalizeError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);

  let code: string;
  let status: number;
  let param: string | undefined;

  if (error instanceof GatewayError) {
    ({ code, status, param } = error);
  } else if (APICallError.isInstance(error)) {
    ({ code, status } = normalizeAiSdkCallError(error));
  } else if (AISDKError.isInstance(error)) {
    code = "GATEWAY_INVALID_REQUEST";
    status = 422;
  } else {
    code = "INTERNAL_SERVER_ERROR";
    status = 500;
  }

  const type = status < 500 ? "invalid_request_error" : "server_error";
  const message = status >= 500 && isProduction() ? "Internal Server Error" : rawMessage;

  return { code, status, param, type, message, rawMessage };
}

export function createErrorResponse(error: unknown): Response {
  const meta = normalizeError(error);
  logError(meta, error);
  return new Response(
    JSON.stringify(new OpenAIError(meta.message, meta.type, meta.code, meta.param)),
    {
      status: meta.status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function logError(
  meta: {
    code: string;
    status: number;
    param?: string;
    rawMessage: string;
  },
  error: unknown,
) {
  const suffix = meta.param ? ` param=${meta.param}` : "";
  if (meta.status < 500) {
    logger.warn(`[error] response: ${meta.code} (${meta.status}) ${meta.rawMessage}${suffix}`);
  } else {
    logger.error(
      `[error] response: ${meta.code} (${meta.status}) ${meta.rawMessage}${suffix}`,
      error instanceof Error ? { stack: error.stack } : undefined,
    );
  }
}
