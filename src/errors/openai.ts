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

const mapType = (status: number) => (status < 500 ? "invalid_request_error" : "server_error");

const maybeMaskMessage = (meta: ReturnType<typeof getErrorMeta>, requestId?: string) => {
  if (!(isProduction() && (meta.status >= 500 || meta.code.includes("UPSTREAM")))) {
    return meta.message;
  }
  // FUTURE: always attach requestId to errors (masked and unmasked)
  return `${STATUS_CODE(meta.status)} (${requestId ?? "see requestId in response headers"})`;
};

export function toOpenAIError(error: unknown): OpenAIError {
  const meta = getErrorMeta(error);

  return new OpenAIError(maybeMaskMessage(meta), mapType(meta.status), meta.code);
}

export function toOpenAIErrorResponse(error: unknown, responseInit?: ResponseInit) {
  const meta = getErrorMeta(error);

  return toResponse(
    new OpenAIError(
      maybeMaskMessage(meta, resolveRequestId(responseInit)),
      mapType(meta.status),
      meta.code,
    ),
    {
      ...responseInit,
      status: meta.status,
      statusText: meta.code,
    },
  );
}
