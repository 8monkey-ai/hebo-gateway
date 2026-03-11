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
  ConversationListParamsSchema,
  type Conversation,
  type ConversationItem,
  type ConversationDeleted,
  type ConversationItemList,
  type ConversationList,
} from "./schema";
import { toConversation, toConversationItem, toConversationDeleted } from "./converters";
import type { ConversationMetadata } from "./storage/types";

export const conversations = (config: GatewayConfig): Endpoint => {
  const parsedConfig = parseConfig(config);
  const storage = parsedConfig.storage;

  async function list(
    ctx: GatewayContext,
    searchParams: URLSearchParams,
  ): Promise<ConversationList> {
    const params = Object.fromEntries(searchParams.entries());

    const parsed = ConversationListParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }

    const { limit, after, order, metadata } = parsed.data;

    // Treat limit 0 as unlimited (up to 100,000 items)
    const entities = await storage.listConversations({
      limit: limit ? limit + 1 : 100000,
      after,
      order,
      metadata: metadata as ConversationMetadata,
    });

    logger.trace(
      { requestId: ctx.requestId, count: entities.length },
      "[storage] listConversations result",
    );

    const has_more = limit !== 0 && entities.length > limit;
    const data = entities
      .slice(0, limit > 0 ? limit : entities.length)
      .map((item) => toConversation(item));

    return {
      object: "list",
      data,
      has_more,
      first_id: data[0]?.id,
      last_id: data.at(-1)?.id,
    };
  }

  async function create(ctx: GatewayContext): Promise<Conversation> {
    let body: unknown;
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

    const entity = await storage.createConversation({
      metadata: parsed.data.metadata as ConversationMetadata,
      items: parsed.data.items,
    });

    logger.debug(`[conversations] created conversation: ${entity.id}`);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] createConversation result");

    return toConversation(entity);
  }

  async function retrieve(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
    const entity = await storage.getConversation(conversationId);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] getConversation result");

    if (!entity) {
      throw new GatewayError("Conversation not found", 404);
    }
    return toConversation(entity);
  }

  async function update(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
    let body: unknown;
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

    const entity = await storage.updateConversation(
      conversationId,
      parsed.data.metadata as ConversationMetadata,
    );
    if (!entity) {
      throw new GatewayError("Conversation not found", 404);
    }

    logger.debug(`[conversations] updated conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] updateConversation result");
    return toConversation(entity);
  }

  async function remove(ctx: GatewayContext, conversationId: string): Promise<ConversationDeleted> {
    const result = await storage.deleteConversation(conversationId);
    logger.debug(`[conversations] deleted conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, result }, "[storage] deleteConversation result");

    return toConversationDeleted(result);
  }

  async function retrieveItem(
    ctx: GatewayContext,
    conversationId: string,
    itemId: string,
  ): Promise<ConversationItem> {
    const entity = await storage.getItem(conversationId, itemId);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] getItem result");

    if (!entity) {
      throw new GatewayError("Item not found", 404);
    }
    return toConversationItem(entity);
  }

  async function deleteItem(
    ctx: GatewayContext,
    conversationId: string,
    itemId: string,
  ): Promise<Conversation> {
    const entity = await storage.deleteItem(conversationId, itemId);
    logger.debug(`[conversations] deleted item ${itemId} from conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] deleteItem result");
    if (!entity) {
      throw new GatewayError("Conversation not found", 404);
    }
    return toConversation(entity);
  }

  async function listItems(
    ctx: GatewayContext,
    conversationId: string,
    searchParams: URLSearchParams,
  ): Promise<ConversationItemList> {
    const params: Record<string, string> = Object.fromEntries(searchParams.entries());

    const parsed = ConversationItemListParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }

    const { limit, after, order } = parsed.data;

    // Treat limit 0 as unlimited (up to 100,000 items)
    const entities = await storage.listItems(conversationId, {
      limit: limit ? limit + 1 : 100000,
      after,
      order,
    });
    logger.trace(
      { requestId: ctx.requestId, conversationId, itemCount: entities?.length },
      "[storage] listItems result",
    );

    if (!entities) throw new GatewayError("Conversation not found", 404);

    const has_more = limit !== 0 && entities.length > limit;
    const data = entities
      .slice(0, limit > 0 ? limit : entities.length)
      .map((item) => toConversationItem(item));

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
    let body: unknown;
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

    const entities = await storage.addItems(conversationId, parsed.data.items);

    if (!entities) {
      throw new GatewayError("Conversation not found", 404);
    }

    logger.debug(
      `[conversations] added ${entities.length} items to conversation: ${conversationId}`,
    );
    logger.trace(
      { requestId: ctx.requestId, conversationId, itemCount: entities.length },
      "[storage] addItems result",
    );

    const data = entities.map((item) => toConversationItem(item));

    return {
      object: "list",
      data,
      has_more: false,
      first_id: data[0]?.id,
      last_id: data.at(-1)?.id,
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

    // GET/POST /conversations (List/Create)
    if (len === 1) {
      if (ctx.request.method === "GET") {
        result = await list(ctx, url.searchParams);
      } else if (ctx.request.method === "POST") {
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
