import {
  AISDKError,
  APICallError,
  DownloadError,
  EmptyResponseBodyError,
  InvalidArgumentError,
  InvalidDataContentError,
  InvalidMessageRoleError,
  InvalidPromptError,
  InvalidResponseDataError,
  InvalidStreamPartError,
  InvalidToolApprovalError,
  InvalidToolInputError,
  JSONParseError,
  LoadAPIKeyError,
  LoadSettingError,
  MessageConversionError,
  MissingToolResultsError,
  NoContentGeneratedError,
  NoImageGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSpeechGeneratedError,
  NoSuchModelError,
  NoSuchToolError,
  NoTranscriptGeneratedError,
  NoVideoGeneratedError,
  RetryError,
  ToolCallNotFoundForApprovalError,
  ToolCallRepairError,
  TooManyEmbeddingValuesForCallError,
  TypeValidationError,
  UIMessageStreamError,
  UnsupportedModelVersionError,
  UnsupportedFunctionalityError,
} from "ai";
import * as z from "zod";

import { isProduction } from "./env";
import { logger } from "./logger";

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

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly param?: string;

  constructor(message: string, code: string, status: number, param?: string, cause?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.param = param;
    this.cause = cause;
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

function normalizeAiSdkError(error: unknown): GatewayError | undefined {
  const cause =
    error instanceof Error && "cause" in error ? (error as { cause?: unknown }).cause : undefined;

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? (error.isRetryable ? 502 : 422);
    const code = `UPSTREAM_${STATUS_CODE(status)}`;
    return new GatewayError(error.message, code, status, undefined, cause);
  }

  if (
    InvalidResponseDataError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    JSONParseError.isInstance(error) ||
    EmptyResponseBodyError.isInstance(error) ||
    NoContentGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error) ||
    NoImageGeneratedError.isInstance(error) ||
    NoObjectGeneratedError.isInstance(error) ||
    NoSpeechGeneratedError.isInstance(error) ||
    NoTranscriptGeneratedError.isInstance(error) ||
    NoVideoGeneratedError.isInstance(error) ||
    DownloadError.isInstance(error) ||
    InvalidStreamPartError.isInstance(error) ||
    ToolCallRepairError.isInstance(error) ||
    UIMessageStreamError.isInstance(error) ||
    RetryError.isInstance(error)
  ) {
    return new GatewayError(error.message, `UPSTREAM_${STATUS_CODE(502)}`, 502, undefined, cause);
  }

  if (
    InvalidArgumentError.isInstance(error) ||
    InvalidPromptError.isInstance(error) ||
    InvalidMessageRoleError.isInstance(error) ||
    InvalidDataContentError.isInstance(error) ||
    MessageConversionError.isInstance(error) ||
    InvalidToolInputError.isInstance(error) ||
    InvalidToolApprovalError.isInstance(error) ||
    ToolCallNotFoundForApprovalError.isInstance(error) ||
    MissingToolResultsError.isInstance(error) ||
    NoSuchToolError.isInstance(error) ||
    UnsupportedModelVersionError.isInstance(error) ||
    UnsupportedFunctionalityError.isInstance(error) ||
    NoSuchModelError.isInstance(error) ||
    TooManyEmbeddingValuesForCallError.isInstance(error)
  ) {
    return new GatewayError(error.message, `UPSTREAM_${STATUS_CODE(422)}`, 422, undefined, cause);
  }

  if (LoadSettingError.isInstance(error) || LoadAPIKeyError.isInstance(error)) {
    return new GatewayError(error.message, `${STATUS_CODE(500)}`, 500, undefined, cause);
  }

  if (AISDKError.isInstance(error)) {
    return new GatewayError(error.message, `${STATUS_CODE(500)}`, 500, undefined, cause);
  }

  return undefined;
}

function normalizeError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);

  let code: string;
  let status: number;
  let param: string | undefined;

  const normalized = normalizeAiSdkError(error);

  if (error instanceof GatewayError) {
    ({ code, status, param } = error);
  } else if (normalized) {
    ({ code, status, param } = normalized);
  } else {
    status = 500;
    code = STATUS_CODE(status);
  }

  const type = status < 500 ? "invalid_request_error" : "server_error";
  const shouldMask = !code.includes("UPSTREAM") && status >= 500 && isProduction();
  const message = shouldMask ? STATUS_CODE(status) : rawMessage;

  return { code, status, param, type, message, rawMessage };
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
  const suffix = meta.param && ` param=${meta.param}`;
  const message = `[error] response: ${meta.code} (${meta.status}) ${meta.rawMessage}${suffix ?? ""}`;

  if (!meta.code.includes("UPSTREAM") && meta.status < 422) {
    return;
  }

  const diagnostics = error instanceof Error && {
    stack: error.stack,
    cause: error.cause,
  };

  if (meta.code.includes("UPSTREAM") || meta.status >= 500) {
    logger.error(message, diagnostics);
  } else {
    logger.warn(message, diagnostics);
  }
}

export function createError(error: unknown): OpenAIError {
  const meta = normalizeError(error);
  logError(meta, error);
  return new OpenAIError(meta.message, meta.type, meta.code, meta.param);
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
