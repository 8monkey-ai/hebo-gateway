import type { Endpoint, GatewayConfig, GatewayContext, TelemetrySignalLevel } from "../../types";

import { parseConfig } from "../../config";
import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { recordRequestDuration } from "../../telemetry/gen-ai";
import { addSpanEvent, setSpanAttributes, withSpan } from "../../telemetry/span";
import {
  getConversationAttributes,
  getConversationGeneralAttributes,
  getItemAttributes,
} from "./otel";
import {
  ConversationCreateBodySchema,
  ConversationItemsAddBodySchema,
  ConversationUpdateBodySchema,
  type Conversation,
  type ConversationItem,
  type ConversationDeleted,
  type ConversationItemList,
} from "./schema";

export const conversations = (config: GatewayConfig): Endpoint => {
  const parsedConfig = parseConfig(config);
  const telemetrySignals = parsedConfig.telemetry?.signals;

  const handler = async (ctx: GatewayContext) => {
    const start = performance.now();
    ctx.operation = "conversations";
    addSpanEvent("hebo.handler.started");

    const signalLevel = telemetrySignals?.gen_ai;
    setSpanAttributes(getConversationGeneralAttributes(ctx, signalLevel));

    const url = new URL(ctx.request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments[0] !== "conversations") {
      throw new GatewayError("Not Found", 404);
    }

    const len = segments.length;

    let result;

    // POST /conversations (Create)
    if (len === 1) {
      if (ctx.request.method === "POST") {
        result = await create(ctx, signalLevel);
      } else {
        throw new GatewayError("Method Not Allowed", 405);
      }
    }

    // GET/POST/DELETE /conversations/{id} (Conversation Instance)
    else if (len === 2) {
      const conversationId = segments[1] as string;
      logger.debug(`[conversations] resolved conversation ID: ${conversationId}`);
      setSpanAttributes(getConversationAttributes(conversationId, signalLevel));

      if (ctx.request.method === "GET") {
        result = await retrieve(ctx, conversationId);
      } else if (ctx.request.method === "POST") {
        result = await update(ctx, conversationId);
      } else if (ctx.request.method === "DELETE") {
        result = await remove(ctx, conversationId);
      } else {
        throw new GatewayError("Method Not Allowed", 405);
      }
    }

    // GET/POST /conversations/{id}/items
    else if (len === 3 && segments[2] === "items") {
      const conversationId = segments[1] as string;
      logger.debug(`[conversations] list/add items for conversation ID: ${conversationId}`);
      setSpanAttributes(getConversationAttributes(conversationId, signalLevel));

      if (ctx.request.method === "GET") {
        result = await listItems(ctx, conversationId, url.searchParams);
      } else if (ctx.request.method === "POST") {
        result = await addItems(ctx, conversationId);
      } else {
        throw new GatewayError("Method Not Allowed", 405);
      }
    }

    // GET/DELETE /conversations/{id}/items/{item_id}
    else if (len === 4 && segments[2] === "items") {
      const conversationId = segments[1] as string;
      const itemId = segments[3] as string;
      logger.debug(
        `[conversations] item access: conversation ID=${conversationId}, item ID=${itemId}`,
      );
      setSpanAttributes(getConversationAttributes(conversationId, signalLevel));
      setSpanAttributes(getItemAttributes(itemId, signalLevel));

      if (ctx.request.method === "GET") {
        result = await retrieveItem(ctx, conversationId, itemId);
      } else if (ctx.request.method === "DELETE") {
        result = await deleteItem(ctx, conversationId, itemId);
      } else {
        throw new GatewayError("Method Not Allowed", 405);
      }
    } else {
      throw new GatewayError("Not Found", 404);
    }

    recordRequestDuration(start, getConversationGeneralAttributes(ctx, signalLevel), signalLevel);
    return result;
  };

  return { handler: winterCgHandler(handler, parsedConfig) };
};

async function create(
  ctx: GatewayContext,
  signalLevel?: TelemetrySignalLevel,
): Promise<Conversation> {
  let body = {};
  try {
    if (
      ctx.request.headers.get("content-length") !== "0" &&
      ctx.request.headers.get("content-type")?.includes("application/json")
    ) {
      body = await ctx.request.json();
    }
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
  addSpanEvent("hebo.request.deserialized");

  const parsed = ConversationCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }
  addSpanEvent("hebo.request.parsed");

  const conversation = await withSpan("storage.createConversation", () =>
    ctx.storage.createConversation(parsed.data),
  );
  logger.trace({ requestId: ctx.requestId, conversation }, "[storage] createConversation result");

  setSpanAttributes(getConversationAttributes(conversation.id, signalLevel));
  return conversation;
}

async function retrieve(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
  const conversation = await withSpan("storage.getConversation", () =>
    ctx.storage.getConversation(conversationId),
  );
  logger.trace({ requestId: ctx.requestId, conversation }, "[storage] getConversation result");

  if (!conversation) {
    throw new GatewayError("Conversation not found", 404);
  }
  return conversation;
}

async function update(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
  addSpanEvent("hebo.request.deserialized");

  const parsed = ConversationUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }
  addSpanEvent("hebo.request.parsed");

  const conversation = await withSpan("storage.updateConversation", () =>
    ctx.storage.updateConversation(conversationId, parsed.data),
  );
  logger.trace({ requestId: ctx.requestId, conversation }, "[storage] updateConversation result");
  return conversation;
}

async function remove(ctx: GatewayContext, conversationId: string): Promise<ConversationDeleted> {
  const result = await withSpan("storage.deleteConversation", () =>
    ctx.storage.deleteConversation(conversationId),
  );
  logger.trace({ requestId: ctx.requestId, result }, "[storage] deleteConversation result");

  return {
    id: result.id,
    deleted: result.deleted,
    object: "conversation.deleted",
  };
}

async function retrieveItem(
  ctx: GatewayContext,
  conversationId: string,
  itemId: string,
): Promise<ConversationItem> {
  const item = await withSpan("storage.getItem", () => ctx.storage.getItem(conversationId, itemId));
  logger.trace({ requestId: ctx.requestId, item }, "[storage] getItem result");

  if (!item) {
    throw new GatewayError("Item not found", 404);
  }
  return item;
}

async function deleteItem(
  ctx: GatewayContext,
  conversationId: string,
  itemId: string,
): Promise<Conversation> {
  const conversation = await withSpan("storage.getConversation", () =>
    ctx.storage.getConversation(conversationId),
  );
  if (!conversation) {
    throw new GatewayError("Conversation not found", 404);
  }

  await withSpan("storage.deleteItem", () => ctx.storage.deleteItem(conversationId, itemId));
  return conversation;
}

async function listItems(
  ctx: GatewayContext,
  conversationId: string,
  searchParams: URLSearchParams,
): Promise<ConversationItemList> {
  const requestedLimit = searchParams.get("limit")
    ? Number.parseInt(searchParams.get("limit")!, 10)
    : 20;
  const after = searchParams.get("after") ?? undefined;
  const order = (searchParams.get("order") as "asc" | "desc") ?? undefined;

  // Fetch limit + 1 to determine if there's more
  const items = await withSpan("storage.listItems", () =>
    ctx.storage.listItems(conversationId, {
      limit: requestedLimit + 1,
      after,
      order,
    }),
  );
  logger.trace({ requestId: ctx.requestId, items }, "[storage] listItems result");

  const has_more = items.length > requestedLimit;
  const data = has_more ? items.slice(0, requestedLimit) : items;

  return {
    object: "list",
    data,
    has_more,
    first_id: data[0]?.id,
    last_id: data.at(-1)?.id,
  };
}

async function addItems(
  ctx: GatewayContext,
  conversationId: string,
): Promise<ConversationItemList> {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
  addSpanEvent("hebo.request.deserialized");

  const parsed = ConversationItemsAddBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }
  addSpanEvent("hebo.request.parsed");

  const items = await withSpan("storage.addItems", () =>
    ctx.storage.addItems(conversationId, parsed.data.items),
  );
  logger.trace({ requestId: ctx.requestId, items }, "[storage] addItems result");

  return {
    object: "list",
    data: items,
    has_more: false,
  };
}
