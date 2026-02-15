import { STATUS_CODE } from "./utils";

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(error: string | Error, status: number, code?: string, cause?: unknown) {
    const msg = typeof error === "string" ? error : error.message;
    super(msg);
    this.status = status;
    this.code = code ?? STATUS_CODE(status);
    this.cause = cause ?? (typeof error === "string" ? undefined : error);
  }
}
