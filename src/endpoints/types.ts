export interface Endpoint {
  handler: (req: Request) => Promise<Response>;
}
