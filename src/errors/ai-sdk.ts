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

import { GatewayError } from "./gateway";
import { STATUS_TEXT } from "./utils";

const normalizeApiCallError = (error: APICallError): GatewayError => {
  const status = error.statusCode ?? (error.isRetryable ? 502 : 422);
  const statusText = `UPSTREAM_${STATUS_TEXT(status)}`;
  return new GatewayError(error, status, statusText, undefined, error.responseHeaders ?? undefined);
};

// `AbortError` / `TimeoutError` (raised by the AI SDK's internal `timeout` controller,
// `AbortSignal.timeout`, or an aborted upstream `fetch`) reach us as plain DOMExceptions
// that none of the AI SDK error classes match. Treat them as upstream gateway timeouts
// so they surface as 504 with retry headers rather than defaulting to 500/502.
// Inbound client disconnects are caught earlier in `lifecycle.ts` and overridden to 499.
const isUpstreamAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

export const normalizeAiSdkError = (error: unknown): GatewayError | undefined => {
  if (APICallError.isInstance(error)) {
    return normalizeApiCallError(error);
  }

  if (isUpstreamAbortError(error)) {
    return new GatewayError(error, 504, `UPSTREAM_${STATUS_TEXT(504)}`);
  }

  if (RetryError.isInstance(error)) {
    if (APICallError.isInstance(error.lastError)) {
      return normalizeApiCallError(error.lastError);
    }
    return new GatewayError(error, 502, `UPSTREAM_${STATUS_TEXT(502)}`);
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
    DownloadError.isInstance(error) ||
    ToolCallRepairError.isInstance(error) ||
    NoImageGeneratedError.isInstance(error) ||
    NoObjectGeneratedError.isInstance(error) ||
    NoSpeechGeneratedError.isInstance(error) ||
    NoTranscriptGeneratedError.isInstance(error) ||
    NoVideoGeneratedError.isInstance(error)
  ) {
    return new GatewayError(error, 502, `UPSTREAM_${STATUS_TEXT(502)}`);
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
    return new GatewayError(error, 422, `UPSTREAM_${STATUS_TEXT(422)}`);
  }

  if (LoadSettingError.isInstance(error) || LoadAPIKeyError.isInstance(error)) {
    return new GatewayError(error, 500);
  }

  if (AISDKError.isInstance(error)) {
    return new GatewayError(error, 500);
  }

  return undefined;
};
