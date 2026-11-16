import { parseConfig } from "./config.ts";
import { audioTranscriptions } from "./endpoints/audio-transcriptions/handler.ts";
import { chatCompletions } from "./endpoints/chat-completions/handler.ts";
import { conversations } from "./endpoints/conversations/handler.ts";
import { embeddings } from "./endpoints/embeddings/handler.ts";
import { messages } from "./endpoints/messages/handler.ts";
import { models } from "./endpoints/models/handler.ts";
import { responses } from "./endpoints/responses/handler.ts";
import { GatewayError } from "./errors/gateway.ts";
import { winterCgHandler } from "./lifecycle.ts";
import { logger } from "./logger/index.ts";
import type { Endpoint, GatewayConfig, HeboGateway } from "./types.ts";

let inflight = 0;

export function gateway(config: GatewayConfig) {
  const basePath = (config.basePath ?? "").replace(/\/+$/u, "");
  const parsedConfig = parseConfig(config);

  const notFoundHandler = winterCgHandler(() => {
    throw new GatewayError("Not Found", 404);
  }, parsedConfig);

  const routes = {
    ["/chat/completions"]: chatCompletions(parsedConfig),
    ["/audio/transcriptions"]: audioTranscriptions(parsedConfig),
    ["/embeddings"]: embeddings(parsedConfig),
    ["/models"]: models(parsedConfig),
    ["/conversations"]: conversations(parsedConfig),
    ["/messages"]: messages(parsedConfig),
    ["/responses"]: responses(parsedConfig),
  } as const satisfies Record<string, Endpoint>;

  const routeEntries = Object.entries(routes);

  const handler = (req: Request, state?: Record<string, unknown>): Promise<Response> => {
    let pathname = new URL(req.url).pathname;
    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length);
    }

    logger.info(`[gateway] ${req.method} ${pathname} (${++inflight})`);
    for (const [route, endpoint] of routeEntries) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        try {
          return endpoint.handler(req, state);
        } finally {
          inflight--;
        }
      }
    }

    return notFoundHandler(req, state);
  };

  return { handler, routes } satisfies HeboGateway<typeof routes>;
}
