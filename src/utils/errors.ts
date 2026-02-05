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
    let status = error.statusCode ?? (error.isRetryable ? 502 : 422);

    let code: string;
    if (status >= 500) code = "UPSTREAM_SERVER_ERROR";
    else code = "UPSTREAM_BAD_REQUEST";

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
    return new GatewayError(error.message, "UPSTREAM_SERVER_ERROR", 502, undefined, cause);
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
    return new GatewayError(error.message, "UPSTREAM_BAD_REQUEST", 422, undefined, cause);
  }

  if (LoadSettingError.isInstance(error) || LoadAPIKeyError.isInstance(error)) {
    return new GatewayError(error.message, "INTERNAL_SERVER_ERROR", 500, undefined, cause);
  }

  if (AISDKError.isInstance(error)) {
    return new GatewayError(error.message, "INTERNAL_SERVER_ERROR", 500, undefined, cause);
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
    code = "INTERNAL_SERVER_ERROR";
    status = 500;
  }

  const type = status < 500 ? "invalid_request_error" : "server_error";
  const message =
    !code.includes("UPSTREAM") && status >= 500 && isProduction()
      ? "Internal Server Error"
      : rawMessage;

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
