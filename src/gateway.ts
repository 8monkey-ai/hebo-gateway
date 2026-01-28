import type { Endpoint, GatewayConfig, HeboGateway } from "./types";

import { parseConfig } from "./config";
import { chatCompletions } from "./endpoints/chat-completions/handler";
import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";

export function gateway(config: GatewayConfig) {
  const parsedConfig = parseConfig(config);

  const basePath = (config.basePath ?? "").replace(/\/+$/, "");

  const routes = {
    ["/chat/completions"]: chatCompletions(parsedConfig),
    ["/embeddings"]: embeddings(parsedConfig),
    ["/models"]: models(parsedConfig),
  } as const satisfies Record<string, Endpoint>;

  const routeEntries = Object.entries(routes);

  const handler = (req: Request): Promise<Response> => {
    let pathname = new URL(req.url).pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length);
    }

    for (const [route, endpoint] of routeEntries) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return endpoint.handler(req);
      }
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return { handler, routes } satisfies HeboGateway<typeof routes>;
}
