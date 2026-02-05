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
  NoSuchProviderError,
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

  constructor(error: string | Error, status: number, code?: string, cause?: unknown) {
    const msg = typeof error === "string" ? error : error.message;
    super(msg);
    this.status = status;
    this.code = code ?? STATUS_CODE(status);
    this.cause =
      cause ?? (typeof error === "string" ? undefined : (error as { cause?: unknown }).cause);
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

  constructor(message: string, type: string = "server_error", code?: string, param: string = "") {
    this.error = { message, type, code: code?.toLowerCase(), param };
  }
}

function normalizeAiSdkError(error: unknown): GatewayError | undefined {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? (error.isRetryable ? 502 : 422);
    const code = `UPSTREAM_${STATUS_CODE(status)}`;
    return new GatewayError(error, status, code);
  }

  if (
    JSONParseError.isInstance(error) ||
    InvalidResponseDataError.isInstance(error) ||
    TypeValidationError.isInstance(error) ||
    EmptyResponseBodyError.isInstance(error) ||
    NoContentGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error) ||
    InvalidStreamPartError.isInstance(error) ||
    UIMessageStreamError.isInstance(error) ||
    RetryError.isInstance(error) ||
    DownloadError.isInstance(error) ||
    ToolCallRepairError.isInstance(error) ||
    NoImageGeneratedError.isInstance(error) ||
    NoObjectGeneratedError.isInstance(error) ||
    NoSpeechGeneratedError.isInstance(error) ||
    NoTranscriptGeneratedError.isInstance(error) ||
    NoVideoGeneratedError.isInstance(error)
  ) {
    return new GatewayError(error, 502, `UPSTREAM_${STATUS_CODE(502)}`);
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
    TooManyEmbeddingValuesForCallError.isInstance(error) ||
    NoSuchModelError.isInstance(error) ||
    NoSuchProviderError.isInstance(error)
  ) {
    return new GatewayError(error, 422, `UPSTREAM_${STATUS_CODE(422)}`);
  }

  if (LoadSettingError.isInstance(error) || LoadAPIKeyError.isInstance(error)) {
    return new GatewayError(error, 500);
  }

  if (AISDKError.isInstance(error)) {
    return new GatewayError(error, 500);
  }

  return undefined;
}

function getErrorMeta(error: unknown) {
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

export function toOpenAIError(error: unknown): OpenAIError {
  const meta = getErrorMeta(error);
  return new OpenAIError(meta.message, meta.type, meta.code);
}

export function createOpenAIErrorResponse(error: unknown) {
  const meta = getErrorMeta(error);
  const response = new Response(
    JSON.stringify(new OpenAIError(meta.message, meta.type, meta.code)),
    {
      status: meta.status,
      statusText: meta.code,
      headers: { "Content-Type": "application/json" },
    },
  );
  return response;
}
