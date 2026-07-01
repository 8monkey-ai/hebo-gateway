import * as z from "zod";

import { resolveRequestId } from "../utils/headers";
import { toResponse } from "../utils/response";
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
  declare status: number;

  constructor(message: string, type: string = "api_error") {
    this.error = { type, message };

    // internal property to derive status from error handlers without breaking official format
    Object.defineProperty(this, "status", { value: 500, writable: true });
  }
}

const mapType = (status: number): string => {
  switch (status) {
    case 400:
      return "invalid_request_error";
    case 401:
      return "authentication_error";
    case 402:
      return "billing_error";
    case 403:
      return "permission_error";
    case 404:
      return "not_found_error";
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

function isAnthropicErrorShape(
  value: unknown,
): value is { type: "error"; error: { type: string; message: string } } {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; error?: unknown };
  if (v.type !== "error" || !v.error || typeof v.error !== "object") return false;
  const inner = v.error as { type?: unknown; message?: unknown };
  return typeof inner.type === "string" && typeof inner.message === "string";
}

export function toAnthropicError(error: unknown, requestId?: string): AnthropicError {
  // Streaming Anthropic-shaped payloads (produced by MessagesTransformStream from
  // upstream stream errors) already carry the correct wire format. Pass them
  // through so we don't clobber `type` via mapType() or turn `message` into
  // `[object Object]` via String().
  if (isAnthropicErrorShape(error)) {
    // `api_error` maps to 500; everything else (invalid_request_error, etc.) is a 4xx-shaped
    // upstream error where the message is safe to expose. Only 5xx messages are masked.
    const status = error.error.type === "api_error" ? 500 : 400;
    return new AnthropicError(
      maybeMaskMessage(error.error.message, status, requestId),
      error.error.type,
    );
  }

  const meta = getErrorMeta(error);

  const anthropicError = new AnthropicError(
    maybeMaskMessage(
      error instanceof Error ? error.message : String(error),
      meta.status,
      requestId,
    ),
    mapType(meta.status),
  );
  anthropicError.status = meta.status;

  return anthropicError;
}

export function toAnthropicErrorResponse(error: unknown, init: ResponseInit): Response {
  return toResponse(
    new AnthropicError(
      maybeMaskMessage(
        error instanceof Error ? error.message : String(error),
        init.status ?? 500,
        resolveRequestId(init),
      ),
      mapType(init.status ?? 500),
    ),
    init,
  );
}
