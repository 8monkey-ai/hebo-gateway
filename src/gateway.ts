import type { GatewayConfig, HeboGateway } from "./types";

import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";

export function gateway(config: GatewayConfig) {
  const basePath = (config.basePath ?? "").replace(/\/+$/, "");

  const routes = {
    ["/models"]: models(config),
    ["/embeddings"]: embeddings(config),
  } as const;

  const handler = (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    const path =
      basePath && url.pathname.startsWith(basePath)
        ? url.pathname.slice(basePath.length)
        : url.pathname;

    const endpoint = routes[path as keyof typeof routes];

    if (endpoint) {
      return endpoint.handler(req);
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return {
    handler: handler as typeof fetch,
    routes,
  } satisfies HeboGateway<typeof routes>;
}
