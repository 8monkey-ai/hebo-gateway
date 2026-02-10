import * as z from "zod";

import { isProduction } from "../utils/env";
import { resolveRequestId } from "../utils/headers";
import { toResponse } from "../utils/response";
import { getErrorMeta, STATUS_CODE } from "./utils";

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

export function toOpenAIError(error: unknown): OpenAIError {
  const meta = getErrorMeta(error);
  return new OpenAIError(meta.message, meta.type, meta.code);
}

export function toOpenAIErrorResponse(error: unknown, responseInit?: ResponseInit) {
  const meta = getErrorMeta(error);

  const shouldMask = isProduction() && (meta.status >= 500 || meta.code.includes("UPSTREAM"));

  let message;
  if (shouldMask) {
    const requestId = resolveRequestId(responseInit);
    message = `${STATUS_CODE(meta.status)} (${requestId})`;
  } else {
    message = meta.message;
  }

  return toResponse(new OpenAIError(message, meta.type, meta.code), {
    ...responseInit,
    status: meta.status,
    statusText: meta.code,
  });
}
