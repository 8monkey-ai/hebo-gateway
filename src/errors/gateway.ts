import { STATUS_CODE } from "./utils";

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(error: unknown, status: number, code?: string, cause?: unknown) {
    const isError = error instanceof Error;
    super(isError ? error.message : String(error));
    this.cause = cause ?? (isError ? error : undefined);
    this.name = "Gateway Error";

    this.status = status;
    this.code = code ?? STATUS_CODE(status);
  }
}
