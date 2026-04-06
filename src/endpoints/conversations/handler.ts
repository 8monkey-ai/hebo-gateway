import * as z from "zod";

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
import { toConversationDeleted } from "./converters";
import { conversationExtension } from "./extension";

export const conversations = (config: GatewayConfig): Endpoint => {
  const parsedConfig = parseConfig(config);
  const storage = parsedConfig.storage.$extends(conversationExtension);

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

    const where: any = {};
    if (metadata !== undefined) {
      where.metadata = metadata;
    }

    // Treat limit 0 as unlimited (up to 100,000 items)
    const entities = await storage.conversations.findMany(
      {
        limit: limit ? limit + 1 : 100000,
        after,
        orderBy: { created_at: order ?? "desc" },
        where,
      },
      ctx,
    );

    logger.trace(
      { requestId: ctx.requestId, count: entities.length },
      "[storage] listConversations result",
    );

    const has_more = limit !== 0 && (entities as any[]).length > limit;
    const targetLength =
      limit > 0 && (entities as any[]).length > limit ? limit : (entities as any[]).length;
    const data: Conversation[] = [];
    for (let i = 0; i < targetLength; i++) {
      const entity = (entities as any[])[i];
      if (entity) {
        data.push(entity as unknown as Conversation);
      }
    }

    return {
      object: "list",
      data,
      has_more,
      first_id: data[0]?.id,
      last_id: data.at(-1)?.id,
    } as any;
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

    const entity = await storage.conversations.create(
      {
        metadata: (parsed.data.metadata as ConversationMetadata) ?? null,
        items: parsed.data.items,
      },
      ctx,
    );

    logger.debug(`[conversations] created conversation: ${(entity as any).id}`);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] createConversation result");

    return entity as unknown as Conversation;
  }

  async function retrieve(ctx: GatewayContext, conversationId: string): Promise<Conversation> {
    const entity = await storage.conversations.findFirst({ id: conversationId }, ctx);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] getConversation result");

    if (!entity) {
      throw new GatewayError("Conversation not found", 404);
    }
    return entity as unknown as Conversation;
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

    const data = {
      ...parsed.data,
      metadata: (parsed.data.metadata as ConversationMetadata) ?? null,
    };
    // Filter out undefined to avoid overwriting with NULL
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined),
    );

    const entity = await storage.conversations.update(conversationId, filteredData, ctx);
    if (!entity) {
      throw new GatewayError("Conversation not found", 404);
    }

    logger.debug(`[conversations] updated conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] updateConversation result");
    return entity as unknown as Conversation;
  }

  async function remove(ctx: GatewayContext, conversationId: string): Promise<ConversationDeleted> {
    const result = await storage.conversations.delete({ id: conversationId }, ctx);
    logger.debug(`[conversations] deleted conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, result }, "[storage] deleteConversation result");

    return toConversationDeleted({ id: conversationId, deleted: (result as any).changes > 0 });
  }

  async function retrieveItem(
    ctx: GatewayContext,
    conversationId: string,
    itemId: string,
  ): Promise<ConversationItem> {
    const entity = await storage.conversation_items.findFirst(
      { id: itemId, conversation_id: conversationId },
      ctx,
    );
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] getItem result");

    if (!entity) {
      throw new GatewayError("Item not found", 404);
    }
    return entity as unknown as ConversationItem;
  }

  async function deleteItem(
    ctx: GatewayContext,
    conversationId: string,
    itemId: string,
  ): Promise<Conversation> {
    const entity = await storage.transaction(async (tx) => {
      await storage.conversation_items.delete(
        { id: itemId, conversation_id: conversationId },
        ctx,
        tx,
      );
      return storage.conversations.findFirst({ id: conversationId }, ctx, undefined, {}, tx);
    });

    logger.debug(`[conversations] deleted item ${itemId} from conversation: ${conversationId}`);
    logger.trace({ requestId: ctx.requestId, entity }, "[storage] deleteItem result");
    if (!entity) {
      throw new GatewayError("Conversation not found", 404);
    }
    return entity as unknown as Conversation;
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

    // First check if conversation exists
    const conv = await storage.conversations.findFirst({ id: conversationId }, ctx);
    if (!conv) throw new GatewayError("Conversation not found", 404);

    // Treat limit 0 as unlimited (up to 100,000 items)
    const entities = await storage.conversation_items.findMany(
      {
        limit: limit ? limit + 1 : 100000,
        after,
        orderBy: { created_at: order ?? "desc" },
        where: { conversation_id: conversationId },
      },
      ctx,
    );
    logger.trace(
      { requestId: ctx.requestId, conversationId, itemCount: entities?.length },
      "[storage] listItems result",
    );

    const has_more = limit !== 0 && (entities as any[]).length > limit;
    const targetLength =
      limit > 0 && (entities as any[]).length > limit ? limit : (entities as any[]).length;
    const data: ConversationItem[] = [];
    for (let i = 0; i < targetLength; i++) {
      const entity = (entities as any[])[i];
      if (entity) {
        data.push(entity as unknown as ConversationItem);
      }
    }

    return {
      object: "list",
      data,
      has_more,
      first_id: data[0]?.id,
      last_id: data.at(-1)?.id,
    } as any;
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

    // First check if conversation exists
    const conv = await storage.conversations.findFirst({ id: conversationId }, ctx);
    if (!conv) throw new GatewayError("Conversation not found", 404);

    const results = await storage.transaction(async (tx) => {
      const items: ConversationItem[] = [];
      const nowMs = Date.now();
      let offset = 0;

      const itemPromises = parsed.data.items.map((input) =>
        storage.conversation_items.create(
          {
            ...input,
            conversation_id: conversationId,
            created_at: new Date(nowMs + offset++),
          },
          ctx,
          tx,
        ),
      );

      const resultsList = await Promise.all(itemPromises);
      for (const item of resultsList) {
        items.push(item as any);
      }
      return items;
    });

    logger.debug(
      `[conversations] added ${results.length} items to conversation: ${conversationId}`,
    );

    return {
      object: "list",
      data: results,
      has_more: false,
      first_id: results[0]?.id,
      last_id: results.at(-1)?.id,
    } as any;
  }

  const handler = async (ctx: GatewayContext) => {
    ctx.operation = "conversations";
    addSpanEvent("hebo.handler.started");

    const url = new URL(ctx.request.url);
    const rawSegments = url.pathname.split("/");
    const segments: string[] = [];
    for (let i = 0; i < rawSegments.length; i++) {
      const segment = rawSegments[i];
      if (segment) {
        segments.push(segment);
      }
    }

    let rootIndex = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i] === "conversations") {
        rootIndex = i;
        break;
      }
    }

    if (rootIndex === -1) {
      throw new GatewayError("Not Found", 404);
    }

    const len = segments.length - rootIndex;

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
      const conversationId = segments[rootIndex + 1] as string;
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
    else if (len === 3 && segments[rootIndex + 2] === "items") {
      const conversationId = segments[rootIndex + 1] as string;
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
    else if (len === 4 && segments[rootIndex + 2] === "items") {
      const conversationId = segments[rootIndex + 1] as string;
      const itemId = segments[rootIndex + 3] as string;
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
