import type { Endpoint } from "./endpoints/types";
import type { GatewayConfig, HeboGateway } from "./types";

import { models } from "./endpoints/models";

export function gateway(config: GatewayConfig): HeboGateway {
  const basePath = config.basePath || "";

  const routes: Record<string, Endpoint> = {
    [`${basePath}/models`]: models(config.models || {}),
  };

  const handler = (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const endpoint = routes[url.pathname];

    if (endpoint) {
      return endpoint.handler(req);
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return { handler };
}
