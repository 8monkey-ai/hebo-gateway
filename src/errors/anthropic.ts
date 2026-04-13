import { resolveRequestId } from "../utils/headers";
import { toResponse } from "../utils/response";
import { getErrorMeta, maybeMaskMessage } from "./utils";

export class AnthropicError {
  readonly type = "error";
  readonly error: { type: string; message: string };

  constructor(message: string, type: string = "api_error") {
    this.error = { type, message };
  }
}

const mapType = (status: number): string => {
  switch (status) {
    case 400:
      return "invalid_request_error";
    case 401:
      return "authentication_error";
    case 403:
      return "permission_error";
    case 404:
      return "not_found_error";
    case 429:
      return "rate_limit_error";
    case 529:
      return "overloaded_error";
    default:
      return status >= 500 ? "api_error" : "invalid_request_error";
  }
};

export function toAnthropicError(error: unknown): AnthropicError {
  const meta = getErrorMeta(error);

  return new AnthropicError(maybeMaskMessage(meta), mapType(meta.status));
}

export function toAnthropicErrorResponse(error: unknown, responseInit?: ResponseInit) {
  const meta = getErrorMeta(error);

  return toResponse(
    new AnthropicError(
      maybeMaskMessage(meta, resolveRequestId(responseInit)),
      mapType(meta.status),
    ),
    {
      status: meta.status,
      statusText: meta.code,
      headers: responseInit?.headers,
    },
  );
}
