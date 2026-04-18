import * as z from "zod";

import { buildRetryHeaders } from "../utils/headers";
import { prepareResponseInit, toResponse } from "../utils/response";
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

export function toOpenAIErrorResponse(error: unknown, requestId: string): Response {
  const meta = getErrorMeta(error);
  const responseInit = prepareResponseInit(requestId, {
    headers: buildRetryHeaders(meta.status, meta.headers as Record<string, string> | undefined),
  });

  return toResponse(
    new OpenAIError(maybeMaskMessage(meta, requestId), mapType(meta.status), meta.code),
    {
      status: meta.status,
      statusText: meta.code,
      headers: responseInit.headers,
    },
  );
}
