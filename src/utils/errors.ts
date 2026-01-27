export interface OpenAICompatibleError {
  message: string;
  type: string;
  param?: string;
  code?: string;
}

export interface OpenAICompatibleErrorResponse {
  error: OpenAICompatibleError;
}

export function toOpenAICompatibleError(
  message: string,
  type: string = "server_error",
  code?: string,
  param?: string,
): OpenAICompatibleErrorResponse {
  return {
    error: {
      message,
      type,
      param,
      code,
    },
  };
}

export function createErrorResponse(
  code: string,
  error: unknown,
  status: number,
  param?: string,
): Response {
  const message = error instanceof Error ? error.message : String(error);
  const type = status < 500 ? "invalid_request_error" : "server_error";

  return new Response(JSON.stringify(toOpenAICompatibleError(message, type, code, param)), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
