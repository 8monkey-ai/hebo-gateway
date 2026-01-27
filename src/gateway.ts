import type {
  Endpoint,
  GatewayConfig,
  GatewayConfigBase,
  GatewayConfigRegistry,
  HeboGateway,
} from "./types";

import { parseConfig } from "./config";
import { chatCompletions } from "./endpoints/chat-completions/handler";
import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";

const buildRoutes = (config: GatewayConfig) =>
  ({
    ["/chat/completions"]: chatCompletions(config),
    ["/embeddings"]: embeddings(config),
    ["/models"]: models(config),
  }) as const satisfies Record<string, Endpoint>;

type GatewayRoutes = ReturnType<typeof buildRoutes>;

export function gateway(config: GatewayConfigBase): HeboGateway<GatewayRoutes>;
export function gateway(config: GatewayConfigRegistry): HeboGateway<GatewayRoutes>;
export function gateway(config: GatewayConfig): HeboGateway<GatewayRoutes> {
  const parsedConfig = parseConfig(config);

  const basePath = (config.basePath ?? "").replace(/\/+$/, "");
  const routes = buildRoutes(parsedConfig);
  const routeEntries = Object.entries(routes);

  const handler = (req: Request): Promise<Response> => {
    let pathname = new URL(req.url).pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length);
    }

    for (const [route, endpoint] of routeEntries) {
      if (pathname.startsWith(route)) {
        return endpoint.handler(req);
      }
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return { handler, routes };
}
