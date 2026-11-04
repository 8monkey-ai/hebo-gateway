import * as z from "zod";

import { resolveRequestId } from "../utils/headers";
import { toResponse } from "../utils/response";
import { type ErrorMeta, getErrorMeta, maybeMaskMessage, STATUS_TEXT } from "./utils";

export const OpenAIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().optional().nullable(),
    param: z.string().optional().nullable(),
  }),
});

export class OpenAIError {
  readonly error: z.infer<typeof OpenAIErrorSchema>["error"];
  declare status: number;

  constructor(message: string, type: string = "server_error", code?: string, param: string = "") {
    this.error = { message, type, code: code?.toLowerCase(), param };

    // internal property to derive status from error handlers without breaking official format
    Object.defineProperty(this, "status", { value: 500, writable: true });
  }
}

const mapType = (status: number) => (status < 500 ? "invalid_request_error" : "server_error");

export function toOpenAIError(
  error: unknown,
  requestId?: string,
  meta: Pick<ErrorMeta, "status" | "statusText"> = getErrorMeta(error),
): OpenAIError {
  const openAIError = new OpenAIError(
    maybeMaskMessage(
      error instanceof Error ? error.message : String(error),
      meta.status,
      requestId,
    ),
    mapType(meta.status),
    meta.statusText,
  );
  openAIError.status = meta.status;

  return openAIError;
}

export function toOpenAIErrorResponse(error: unknown, init: ResponseInit = {}): Response {
  const { status = getErrorMeta(error).status, statusText = STATUS_TEXT(status) } = init;

  return toResponse(toOpenAIError(error, resolveRequestId(init), { status, statusText }), {
    ...init,
    status,
    statusText,
  });
}
