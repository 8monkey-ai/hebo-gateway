import type {
  Endpoint,
  GatewayConfig,
  GatewayConfigBase,
  GatewayConfigRegistry,
  HeboGateway,
} from "./types";

import { parseConfig } from "./config";
import { embeddings } from "./endpoints/embeddings/handler";
import { models } from "./endpoints/models/handler";

const buildRoutes = (config: GatewayConfig) =>
  ({
    ["/models"]: models(config),
    ["/embeddings"]: embeddings(config),
  }) as const satisfies Record<string, Endpoint>;

type GatewayRoutes = ReturnType<typeof buildRoutes>;

export function gateway(config: GatewayConfigBase): HeboGateway<GatewayRoutes>;
export function gateway(config: GatewayConfigRegistry): HeboGateway<GatewayRoutes>;
export function gateway(config: GatewayConfig): HeboGateway<GatewayRoutes> {
  const parsedConfig = parseConfig(config);
  const basePath = (config.basePath ?? "").replace(/\/+$/, "");
  const routes = buildRoutes(parsedConfig);

  const handler = (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    const path =
      basePath && url.pathname.startsWith(basePath)
        ? url.pathname.slice(basePath.length)
        : url.pathname;

    const route = "/" + path.split("/", 2)[1];

    const endpoint = routes[route as keyof typeof routes];

    if (endpoint) {
      return endpoint.handler(req);
    }

    return Promise.resolve(new Response("Not Found", { status: 404 }));
  };

  return {
    handler: handler as typeof fetch,
    routes,
  };
}
