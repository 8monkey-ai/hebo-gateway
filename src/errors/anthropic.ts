import * as z from "zod";

import { buildRetryHeaders } from "../utils/headers";
import { prepareResponseInit, toResponse } from "../utils/response";
import { getErrorMeta, maybeMaskMessage } from "./utils";

export const AnthropicErrorSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }),
});

export class AnthropicError {
  readonly type = "error" as const;
  readonly error: z.infer<typeof AnthropicErrorSchema>["error"];

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
    case 402:
      return "billing_error";
    case 413:
      return "request_too_large";
    case 429:
      return "rate_limit_error";
    case 504:
      return "timeout_error";
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

export function toAnthropicErrorResponse(error: unknown, requestId: string): Response {
  const meta = getErrorMeta(error);
  const upstreamHeaders = meta.response?.headers as Record<string, string> | undefined;
  const responseInit = prepareResponseInit(requestId, {
    headers: buildRetryHeaders(meta.status, upstreamHeaders),
  });

  return toResponse(new AnthropicError(maybeMaskMessage(meta, requestId), mapType(meta.status)), {
    status: meta.status,
    statusText: meta.code,
    headers: responseInit.headers,
  });
}
