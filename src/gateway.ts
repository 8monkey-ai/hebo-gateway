import type { Endpoint, GatewayConfig, HeboGateway } from "./types";

import { parseConfig } from "./config";
import { chatCompletions } from "./endpoints/chat-completions/handler";
import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";
import { getRequestMeta, getResponseMeta } from "./instrumentation";
import { logger } from "./logger";

export function gateway(config: GatewayConfig) {
  const basePath = (config.basePath ?? "").replace(/\/+$/, "");
  const parsedConfig = parseConfig(config);

  const routes = {
    ["/chat/completions"]: chatCompletions(parsedConfig),
    ["/embeddings"]: embeddings(parsedConfig),
    ["/models"]: models(parsedConfig),
  } as const satisfies Record<string, Endpoint>;

  const routeEntries = Object.entries(routes);

  const handler = (req: Request, state?: Record<string, unknown>): Promise<Response> => {
    const start = performance.now();

    let pathname = new URL(req.url).pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length);
    }

    for (const [route, endpoint] of routeEntries) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return endpoint.handler(req, state);
      }
    }

    const response = new Response("Not Found", { status: 404 });
    const durationMs = +(performance.now() - start).toFixed(2);
    logger.warn(
      {
        req: getRequestMeta(req),
        res: Object.assign(getResponseMeta(response), { durationMs, ttfbMs: durationMs }),
      },
      "[gateway] route not found",
    );
    return Promise.resolve(response);
  };

  return { handler, routes } satisfies HeboGateway<typeof routes>;
}
