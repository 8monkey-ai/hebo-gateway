import * as z from "zod";

import { toResponse } from "../utils/response";
import { getErrorMeta } from "./utils";

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
  return toResponse(
    new OpenAIError(meta.message, meta.type, meta.code),
    Object.assign({}, responseInit, { status: meta.status, statusText: meta.code }),
  );
}
