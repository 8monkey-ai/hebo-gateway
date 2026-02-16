import type { Endpoint, GatewayConfig, HeboGateway } from "./types";

import { parseConfig } from "./config";
import { chatCompletions } from "./endpoints/chat-completions/handler";
import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";
import { GatewayError } from "./errors/gateway";
import { winterCgHandler } from "./lifecycle";
import { logger } from "./logger";

export function gateway(config: GatewayConfig) {
  const basePath = (config.basePath ?? "").replace(/\/+$/, "");
  const parsedConfig = parseConfig(config);

  const notFoundHandler = winterCgHandler(() => {
    throw new GatewayError("Not Found", 404);
  }, parsedConfig);

  const routes = {
    ["/chat/completions"]: chatCompletions(parsedConfig),
    ["/embeddings"]: embeddings(parsedConfig),
    ["/models"]: models(parsedConfig),
  } as const satisfies Record<string, Endpoint>;

  const routeEntries = Object.entries(routes);

  const handler = (req: Request, state?: Record<string, unknown>): Promise<Response> => {
    let pathname = new URL(req.url).pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length);
    }

    logger.info(`[gateway] ${req.method} ${pathname}`);
    for (const [route, endpoint] of routeEntries) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return endpoint.handler(req, state);
      }
    }

    return notFoundHandler(req, state);
  };

  return { handler, routes } satisfies HeboGateway<typeof routes>;
}
