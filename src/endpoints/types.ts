export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

export interface Endpoint {
  handler: (req: Request) => Promise<Response>;
}
