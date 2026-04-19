import * as z from "zod";

import { resolveRequestId } from "../utils/headers";
import { toResponse } from "../utils/response";
import { getErrorMeta, maybeMaskMessage } from "./utils";

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

export function toOpenAIError(error: unknown, requestId?: string): OpenAIError {
  const meta = getErrorMeta(error);

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

export function toOpenAIErrorResponse(error: unknown, init: ResponseInit): Response {
  return toResponse(
    new OpenAIError(
      maybeMaskMessage(
        error instanceof Error ? error.message : String(error),
        init.status ?? 500,
        resolveRequestId(init),
      ),
      mapType(init.status ?? 500),
      init.statusText ?? "INTERNAL_SERVER_ERROR",
    ),
    init,
  );
}
