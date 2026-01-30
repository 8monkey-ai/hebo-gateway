export class OpenAIError {
  readonly error;

  constructor(message: string, type: string = "server_error", code?: string, param?: string) {
    this.error = { message, type, code, param };
  }
}

export function createErrorResponse(
  code: string,
  error: unknown,
  status: number,
  param?: string,
): Response {
  // FUTURE: unpack upstream `AISDKError` and forward to the client
  // E.g. invalid ProviderOptions contain InvalidArgumentError in error.cause
  const message = error instanceof Error ? error.message : String(error);
  const type = status < 500 ? "invalid_request_error" : "server_error";

  return new Response(JSON.stringify(new OpenAIError(message, type, code, param)), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
