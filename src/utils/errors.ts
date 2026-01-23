export interface ApiError {
  code: string;
  message: string;
  detail?: string;
}

export function createErrorResponse(
  code: string,
  message: string,
  status: number,
  detail?: string,
): Response {
  const error: ApiError = {
    code,
    message,
  };
  if (detail) {
    error.detail = detail;
  }
  return new Response(JSON.stringify(error), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
