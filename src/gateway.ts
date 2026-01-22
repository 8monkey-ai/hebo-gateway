import type { GatewayConfig, HeboGateway } from "./types";

import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";

export function gateway(config: GatewayConfig): HeboGateway {
  const basePath = config.basePath?.replace(/\/+$/, "") || "";

  const routes: Record<string, { handler: typeof fetch }> = {
    [`${basePath}/models`]: models(config.models || {}),
    [`${basePath}/embeddings`]: embeddings(config.providers),
  };

  const handler = (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const endpoint = routes[url.pathname];

    if (endpoint) {
      return endpoint.handler(req);
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return { handler: handler as typeof fetch };
}
