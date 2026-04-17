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

  constructor(message: string, type: string = "server_error", code?: string, param: string = "") {
    this.error = { message, type, code: code?.toLowerCase(), param };
  }
}

const mapType = (status: number) => (status < 500 ? "invalid_request_error" : "server_error");

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
      status: meta.status,
      statusText: meta.code,
      headers: responseInit?.headers,
    },
  );
}
