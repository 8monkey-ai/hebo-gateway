import * as z from "zod/mini";

import type { Endpoint, GatewayConfig, GatewayContext } from "../../types";

import { parseConfig } from "../../config";
import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { addSpanEvent } from "../../telemetry/span";
import {
  ConversationCreateBodySchema,
  ConversationItemsAddBodySchema,
  ConversationUpdateBodySchema,
  type Conversation,
  type ConversationItem,
  type ConversationDeleted,
  type ConversationItemList,
} from "./schema";
import { createConversation, createConversationItem } from "./utils";

export const conversations = (config: GatewayConfig): Endpoint => {
  const parsedConfig = parseConfig(config);

  const handler = async (ctx: GatewayContext) => {
    ctx.operation = "conversations";
    addSpanEvent("hebo.handler.started");

    const url = new URL(ctx.request.url);
    const allSegments = url.pathname.split("/").filter(Boolean);
    const rootIndex = allSegments.indexOf("conversations");

    if (rootIndex === -1) {
      throw new GatewayError("Not Found", 404);
    }

    const segments = allSegments.slice(rootIndex);
    const len = segments.length;

    let result;

    // POST /conversations (Create)
    if (len === 1) {
      if (ctx.request.method === "POST") {
        result = await create(ctx);
      } else {
        throw new GatewayError("Method Not Allowed", 405);
      }
    }

    // GET/POST/DELETE /conversations/{id} (Conversation Instance)
    else if (len === 2) {
      const conversationId = segments[1] as string;
      logger.debug(`[conversations] resolved conversation ID: ${conversationId}`);

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

    return result;
  };

  return { handler: winterCgHandler(handler, parsedConfig) };
};

async function create(ctx: GatewayContext): Promise<Conversation> {
  let body = {};
  try {
    body = await ctx.request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }
  addSpanEvent("hebo.request.deserialized");

  const parsed = ConversationCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, z.prettifyError(parsed.error));
  }
  addSpanEvent("hebo.request.parsed");

  const conversation = createConversation({ metadata: parsed.data.metadata });
  await ctx.storage.createConversation(conversation);

  if (parsed.data.items && parsed.data.items.length > 0) {
    const items = parsed.data.items.map((item) => createConversationItem(item));
    await ctx.storage.addItems(conversation.id, items);
  }

  logger.trace({ requestId: ctx.requestId, conversation }, "[storage] createConversation result");

  return conversation;
}

async function retrieve(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
  const conversation = await ctx.storage.getConversation(conversationId);
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
    throw new GatewayError("Invalid Request", 400, undefined, z.prettifyError(parsed.error));
  }
  addSpanEvent("hebo.request.parsed");

  const conversation = await retrieve(ctx, conversationId);
  conversation.metadata = parsed.data.metadata;

  await ctx.storage.updateConversation(conversation);
  logger.trace({ requestId: ctx.requestId, conversation }, "[storage] updateConversation result");
  return conversation;
}

async function remove(ctx: GatewayContext, conversationId: string): Promise<ConversationDeleted> {
  const result = await ctx.storage.deleteConversation(conversationId);
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
  const item = await ctx.storage.getItem(conversationId, itemId);
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
  const conversation = await ctx.storage.getConversation(conversationId);
  if (!conversation) {
    throw new GatewayError("Conversation not found", 404);
  }

  await ctx.storage.deleteItem(conversationId, itemId);
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
  const items = await ctx.storage.listItems(conversationId, {
    limit: requestedLimit + 1,
    after,
    order,
  });
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
    throw new GatewayError("Invalid Request", 400, undefined, z.prettifyError(parsed.error));
  }
  addSpanEvent("hebo.request.parsed");

  const items = parsed.data.items.map((item) => createConversationItem(item));
  await ctx.storage.addItems(conversationId, items);

  logger.trace({ requestId: ctx.requestId, items }, "[storage] addItems result");

  return {
    object: "list",
    data: items,
    has_more: false,
  };
}
