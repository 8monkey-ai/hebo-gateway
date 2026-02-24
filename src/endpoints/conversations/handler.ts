import type { Endpoint, GatewayConfig, GatewayContext } from "../../types";

import { parseConfig } from "../../config";
import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import {
  ConversationCreateBodySchema,
  ConversationItemsAddBodySchema,
  ConversationUpdateBodySchema,
} from "./schema";

export const conversations = (config: GatewayConfig): Endpoint => {
  const parsedConfig = parseConfig(config);

  const handler = async (ctx: GatewayContext) => {
    const url = new URL(ctx.request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments[0] !== "conversations") {
      throw new GatewayError("Not Found", 404);
    }

    const len = segments.length;

    // POST /conversations (Create)
    if (len === 1) {
      if (ctx.request.method === "POST") {
        return await create(ctx);
      }
      throw new GatewayError("Method Not Allowed", 405);
    }

    // GET/POST/DELETE /conversations/{id} (Conversation Instance)
    if (len === 2) {
      const conversationId = segments[1];
      if (ctx.request.method === "GET") {
        return await retrieve(ctx, conversationId);
      }
      if (ctx.request.method === "POST") {
        return await update(ctx, conversationId);
      }
      if (ctx.request.method === "DELETE") {
        return await remove(ctx, conversationId);
      }
      throw new GatewayError("Method Not Allowed", 405);
    }

    // GET/POST /conversations/{id}/items
    if (len === 3 && segments[2] === "items") {
      const conversationId = segments[1];
      if (ctx.request.method === "GET") {
        return await listItems(ctx, conversationId, url.searchParams);
      }
      if (ctx.request.method === "POST") {
        return await addItems(ctx, conversationId);
      }
      throw new GatewayError("Method Not Allowed", 405);
    }

    // GET/DELETE /conversations/{id}/items/{item_id}
    if (len === 4 && segments[2] === "items") {
      const conversationId = segments[1];
      const itemId = segments[3];
      if (ctx.request.method === "GET") {
        return await retrieveItem(ctx, conversationId, itemId);
      }
      if (ctx.request.method === "DELETE") {
        return await deleteItem(ctx, conversationId, itemId);
      }
      throw new GatewayError("Method Not Allowed", 405);
    }

    throw new GatewayError("Not Found", 404);
  };

  return { handler: winterCgHandler(handler, parsedConfig) };
};

async function create(ctx: GatewayContext) {
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

  const parsed = ConversationCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }

  return ctx.storage.createConversation(parsed.data);
}

async function retrieve(ctx: GatewayContext, conversationId: string) {
  const conversation = await ctx.storage.getConversation(conversationId);
  if (!conversation) {
    throw new GatewayError("Conversation not found", 404);
  }
  return conversation;
}

async function update(ctx: GatewayContext, conversationId: string) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    throw new GatewayError("Invalid JSON", 400);
  }

  const parsed = ConversationUpdateBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayError("Invalid Request", 400, undefined, parsed.error);
  }

  return ctx.storage.updateConversation(conversationId, parsed.data);
}

async function remove(ctx: GatewayContext, conversationId: string) {
  const result = await ctx.storage.deleteConversation(conversationId);
  return {
    id: result.id,
    deleted: result.deleted,
    object: "conversation.deleted",
  };
}

async function retrieveItem(ctx: GatewayContext, conversationId: string, itemId: string) {
  const item = await ctx.storage.getItem(conversationId, itemId);
  if (!item) {
    throw new GatewayError("Item not found", 404);
  }
  return {
    id: item.id,
    object: "conversation.item",
    created_at: item.created_at,
    ...item.data,
  };
}

async function deleteItem(ctx: GatewayContext, conversationId: string, itemId: string) {
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
) {
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

  const has_more = items.length > requestedLimit;
  const data = has_more ? items.slice(0, requestedLimit) : items;

  return {
    object: "list",
    data: data.map((item) => ({
      id: item.id,
      object: "conversation.item",
      created_at: item.created_at,
      ...item.data,
    })),
    has_more,
    first_id: data[0]?.id,
    last_id: data.at(-1)?.id,
  };
}

async function addItems(ctx: GatewayContext, conversationId: string) {
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

  const items = await ctx.storage.addItems(conversationId, parsed.data.items);

  return {
    object: "list",
    data: items.map((item) =>
      Object.assign(
        { id: item.id, object: `conversation.item`, created_at: item.created_at },
        item.data,
      ),
    ),
    has_more: false,
  };
}
