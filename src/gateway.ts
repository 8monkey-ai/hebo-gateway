import type { HeboGatewayConfig, HeboGateway, Endpoint, APIContext } from "./types";

import { listModelsEndpoint } from "./endpoints/list-models";

const defaultEndpoints: Endpoint[] = [listModelsEndpoint];

export function gateway(config: HeboGatewayConfig): HeboGateway {
  const handler = (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    for (const endpoint of defaultEndpoints) {
      if (req.method === endpoint.method && url.pathname.endsWith(endpoint.path)) {
        const ctx: APIContext = {
          request: req,
          config,
          url,
        };

        return endpoint.handler(ctx);
      }
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return { handler };
}
