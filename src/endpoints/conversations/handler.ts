import type { Endpoint, GatewayConfig, GatewayContext } from "../../types";

import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { ConversationCreateBodySchema, ConversationItemsAddBodySchema } from "./schema";

/**
 * Unified handler for /conversations endpoints.
 *
 * POST /conversations - Create a conversation
 * GET  /conversations/{id}/items - List items
 * POST /conversations/{id}/items - Add items
 */
export const conversations = (config: GatewayConfig): Endpoint => {
  // eslint-disable-next-line require-await
  const handler = async (ctx: GatewayContext) => {
    const url = new URL(ctx.request.url);
    const pathname = url.pathname;

    // Match /conversations or /conversations/{id}/items
    const itemsMatch = pathname.match(/\/conversations\/([^/]+)\/items\/?$/);
    const rootMatch = pathname.match(/\/conversations\/?$/);

    if (rootMatch) {
      if (ctx.request.method === "POST") {
        return handleCreate(ctx);
      }
      throw new GatewayError("Method Not Allowed", 405);
    }

    if (itemsMatch) {
      const conversationId = itemsMatch[1];
      if (ctx.request.method === "GET") {
        return handleListItems(ctx, conversationId);
      }
      if (ctx.request.method === "POST") {
        return handleAddItems(ctx, conversationId);
      }
      throw new GatewayError("Method Not Allowed", 405);
    }

    throw new GatewayError("Not Found", 404);
  };

  return { handler: winterCgHandler(handler, config) };
};

async function handleCreate(ctx: GatewayContext) {
  let body = {};
  try {
    if (ctx.request.headers.get("content-length") !== "0") {
      body = await ctx.request.json();
    }
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }

  const parsed = ConversationCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }

  return ctx.storage.createConversation({
    metadata: parsed.data.metadata,
  });
}

async function handleListItems(ctx: GatewayContext, conversationId: string) {
  const items = await ctx.storage.listItems(conversationId);

  return {
    object: "list",
    data: items.map((item) => ({
      id: item.id,
      object: "conversation.item",
      created_at: item.created_at,
      type: "message",
      role: item.message.role,
      content: item.message.content,
    })),
    has_more: false,
    first_id: items[0]?.id,
    last_id: items.at(-1)?.id,
  };
}

async function handleAddItems(ctx: GatewayContext, conversationId: string) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }

  const parsed = ConversationItemsAddBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }

  const messages = parsed.data.items.map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { type, ...msg } = item;
    return msg;
  });

  const items = await ctx.storage.addItems(conversationId, messages);

  return {
    object: "list",
    data: items.map((item) => ({
      id: item.id,
      object: "conversation.item",
      created_at: item.created_at,
      type: "message",
      role: item.message.role,
      content: item.message.content,
    })),
    has_more: false,
  };
}
