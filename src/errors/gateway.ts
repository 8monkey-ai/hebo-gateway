import { STATUS_TEXT } from "./utils";

export class GatewayError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string> | undefined;

  constructor(
    error: unknown,
    status: number,
    statusText?: string,
    cause?: unknown,
    headers?: Record<string, string>,
  ) {
    const isError = error instanceof Error;
    super(isError ? error.message : String(error));

    this.name = "GatewayError";
    this.cause = cause ?? (isError ? error : undefined);

    this.status = status;
    this.statusText = statusText ?? STATUS_TEXT(status);
    this.headers = headers;
  }
}
