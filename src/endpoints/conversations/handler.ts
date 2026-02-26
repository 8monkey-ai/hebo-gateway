import * as z from "zod/mini";

import type { Endpoint, GatewayConfig, GatewayContext } from "../../types";

import { parseConfig } from "../../config";
import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { addSpanEvent } from "../../telemetry/span";
import {
  ConversationCreateParamsSchema,
  ConversationItemsAddBodySchema,
  ConversationUpdateBodySchema,
  ConversationItemListParamsSchema,
  type Conversation,
  type ConversationItem,
  type ConversationDeleted,
  type ConversationItemList,
} from "./schema";
import { createConversation, createConversationItem } from "./utils";

export const conversations = (config: GatewayConfig): Endpoint => {
  const parsedConfig = parseConfig(config);
  const storage = parsedConfig.storage;

  async function create(ctx: GatewayContext): Promise<Conversation> {
    let body = {};
    try {
      body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }
    addSpanEvent("hebo.request.deserialized");

    const parsed = ConversationCreateParamsSchema.safeParse(body);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    addSpanEvent("hebo.request.parsed");

    const conversation = createConversation({ metadata: parsed.data.metadata });
    const items = parsed.data.items?.map((item) => createConversationItem(item));

    await storage.createConversation(conversation, items);

    logger.debug(`[conversations] created conversation: ${conversation.id}`);
    logger.trace({ requestId: ctx.requestId, conversation }, "[storage] createConversation result");

    return conversation;
  }

  async function retrieve(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
    const conversation = await storage.getConversation(conversationId);
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
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    addSpanEvent("hebo.request.parsed");

    const conversation = await storage.updateConversation(conversationId, parsed.data.metadata);
    if (!conversation) {
      throw new GatewayError("Conversation not found", 404);
    }

    logger.debug(`[conversations] updated conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, conversation }, "[storage] updateConversation result");
    return conversation;
  }

  async function remove(ctx: GatewayContext, conversationId: string): Promise<ConversationDeleted> {
    const result = await storage.deleteConversation(conversationId);
    logger.debug(`[conversations] deleted conversation: ${conversationId}`);
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
    const item = await storage.getItem(conversationId, itemId);
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
    const conversation = await storage.deleteItem(conversationId, itemId);
    logger.debug(`[conversations] deleted item ${itemId} from conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, conversation }, "[storage] deleteItem result");
    if (!conversation) {
      throw new GatewayError("Conversation not found", 404);
    }
    return conversation;
  }

  async function listItems(
    ctx: GatewayContext,
    conversationId: string,
    searchParams: URLSearchParams,
  ): Promise<ConversationItemList> {
    const params: Record<string, any> = Object.fromEntries(searchParams.entries());

    const parsed = ConversationItemListParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }

    const { limit, after, order } = parsed.data;

    // Fetch limit + 1 to determine if there's more
    const items = await storage.listItems(conversationId, {
      limit: limit + 1,
      after,
      order,
    });
    logger.trace(
      { requestId: ctx.requestId, conversationId, itemCount: items?.length },
      "[storage] listItems result",
    );

    if (!items) {
      throw new GatewayError("Conversation not found", 404);
    }

    const has_more = items.length > limit;
    const data = has_more ? items.slice(0, limit) : items;

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
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    addSpanEvent("hebo.request.parsed");

    const items = parsed.data.items.map((item) => createConversationItem(item));
    const result = await storage.addItems(conversationId, items);

    if (!result) {
      throw new GatewayError("Conversation not found", 404);
    }

    logger.debug(`[conversations] added ${result.length} items to conversation: ${conversationId}`);
    logger.trace(
      { requestId: ctx.requestId, conversationId, itemCount: result.length },
      "[storage] addItems result",
    );

    return {
      object: "list",
      data: result,
      has_more: false,
      first_id: result[0]?.id,
      last_id: result.at(-1)?.id,
    };
  }

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
