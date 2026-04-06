import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type {
  DatabaseSchema,
  StorageQueryOptions,
  Storage,
} from "../../storage/types";
import {
  createRowMapper,
  mergeData,
  parseJson,
  toSeconds,
} from "../../storage/dialects/utils";
import type { ResponsesMetadata, ResponsesInputItem } from "../responses/schema";
import type { Conversation, ConversationItem } from "./schema";

export const CONVERSATION_SCHEMA: DatabaseSchema = {
  conversations: {
    id: { type: "VARCHAR(255)" },
    created_at: { type: "TIMESTAMP" },
    metadata: { type: "JSON" },
    $partitionBy: ["id"],
    $indexes: [["created_at DESC", "id DESC"]],
  },
  conversation_items: {
    id: { type: "VARCHAR(255)", skippingIndex: true },
    conversation_id: { type: "VARCHAR(255)" },
    created_at: { type: "TIMESTAMP" },
    type: { type: "VARCHAR(64)" },
    data: { type: "JSON" },
    $primaryKey: ["conversation_id", "id"],
    $partitionBy: ["conversation_id"],
    $indexes: [["conversation_id", "created_at DESC", "id DESC"]],
    $memoryLimit: 10000,
  },
};

const conversationRowMapper = createRowMapper<Conversation>([
  parseJson("metadata"),
  toSeconds("created_at"),
  (row) => {
    row.object = "conversation";
    return row;
  },
]);

const itemRowMapper = createRowMapper<ConversationItem>([
  parseJson("data"),
  toSeconds("created_at"),
  mergeData("data"),
  (row) => {
    row.object = "conversation.item";
    return row;
  },
]);

/**
 * Repository for managing Conversations and their Items.
 * Consumes the generic Storage engine.
 */
export class ConversationRepository<TExtra = Record<string, any>> {
  private readonly storage: Storage<typeof CONVERSATION_SCHEMA, TExtra>;

  constructor(storage: Storage<any, TExtra>, private readonly isGreptime: boolean = false) {
    this.storage = storage as Storage<typeof CONVERSATION_SCHEMA, TExtra>;
  }

  async migrate(additionalFields?: Record<string, Record<string, { type: string }>>) {
    await this.storage.migrate(CONVERSATION_SCHEMA, additionalFields);
  }

  async createConversation(
    params: {
      metadata?: ResponsesMetadata;
      items?: ResponsesInputItem[];
    } & Partial<TExtra>,
    context: any = {},
  ): Promise<Conversation> {
    const id = this.isGreptime ? uuidv4() : uuidv7();
    const metadata = params.metadata ?? null;
    const now = new Date();

    const data = { id, metadata, created_at: now, ...params };
    delete (data as any).items;

    return this.storage.transaction(async (tx) => {
      await this.storage.conversations.create(data, context, tx);

      const conversation = {
        id,
        created_at: Math.floor(now.getTime() / 1000),
        metadata,
        object: "conversation",
      } as Conversation;

      if (params.items?.length) {
        await this.addItemsInternal(id, params.items, context, tx);
      }

      return conversation;
    });
  }

  async getConversation(
    id: string,
    context: any = {},
  ): Promise<Conversation | undefined> {
    return this.storage.conversations.findFirst({ id }, context, conversationRowMapper, {
      orderBy: { created_at: "desc" },
    });
  }

  async listConversations(
    params: StorageQueryOptions<TExtra> & {
      order?: "asc" | "desc";
      metadata?: Record<string, string>;
    },
    context: any = {},
  ): Promise<Conversation[]> {
    let where: WhereCondition<TExtra> = params.where ?? {};

    if (params.metadata) {
      where = { ...where, metadata: params.metadata } as WhereCondition<TExtra>;
    }

    const options: StorageQueryOptions<TExtra> = {
      limit: params.limit,
      after: params.after,
      orderBy: params.orderBy ?? { created_at: params.order ?? "desc" },
      where,
    };
    return this.storage.conversations.findMany(options, context, conversationRowMapper);
  }

  async updateConversation(
    id: string,
    params: { metadata?: ResponsesMetadata } & Partial<TExtra>,
    context: any = {},
  ): Promise<Conversation | undefined> {
    const conversation = await this.getConversation(id, context);
    if (!conversation) return;

    const meta = params.metadata ?? null;
    const data = {
      ...params,
      metadata: meta,
      created_at: new Date(Number(conversation.created_at) * 1000),
    };

    await this.storage.conversations.update(id, data, context);

    return {
      ...conversation,
      ...params,
      metadata: meta,
    } as Conversation;
  }

  async deleteConversation(
    id: string,
    context: any = {},
  ): Promise<{ id: string; deleted: boolean }> {
    const { changes } = await this.storage.conversations.delete({ id }, context);
    return { id, deleted: changes > 0 };
  }

  async addItems(
    conversationId: string,
    items: ResponsesInputItem[],
    context: any = {},
  ): Promise<ConversationItem[] | undefined> {
    const conversation = await this.getConversation(conversationId, context);
    if (!conversation) return;

    return this.storage.transaction(async (tx) => {
      return this.addItemsInternal(conversationId, items, context, tx);
    });
  }

  private async addItemsInternal(
    conversationId: string,
    items: ResponsesInputItem[],
    context: any,
    tx: any,
  ): Promise<ConversationItem[] | undefined> {
    const now = Date.now();
    const results: ConversationItem[] = [];

    let offset = 0;
    for (const input of items) {
      const id = input.id ?? uuidv7();
      const createdAt = new Date(now + offset++);

      const data = {
        id,
        conversation_id: conversationId,
        type: input.type,
        data: input,
        created_at: createdAt,
        ...input,
      };

      await this.storage.conversation_items.create(data, context, tx);

      results.push({
        ...input,
        id,
        object: "conversation.item",
        created_at: Math.floor(createdAt.getTime() / 1000),
      } as unknown as ConversationItem);
    }

    return results;
  }

  async getItem(
    conversationId: string,
    itemId: string,
    context: any = {},
  ): Promise<ConversationItem | undefined> {
    return this.storage.conversation_items.findFirst(
      { id: itemId, conversation_id: conversationId },
      context,
      itemRowMapper,
    );
  }

  async deleteItem(
    conversationId: string,
    itemId: string,
    context: any = {},
  ): Promise<Conversation | undefined> {
    return this.storage.transaction(async (tx) => {
      await this.storage.conversation_items.delete(
        { id: itemId, conversation_id: conversationId },
        context,
        tx,
      );
      return this.getConversation(conversationId, context);
    });
  }

  async listItems(
    conversationId: string,
    params: StorageQueryOptions<TExtra> & { order?: "asc" | "desc" },
    context: any = {},
  ): Promise<ConversationItem[] | undefined> {
    const conversation = await this.getConversation(conversationId, context);
    if (!conversation) return;

    const options: StorageQueryOptions<TExtra> = {
      limit: params.limit,
      after: params.after,
      orderBy: params.orderBy ?? { created_at: params.order ?? "desc" },
      where: { ...params.where, conversation_id: conversationId } as WhereCondition<TExtra>,
    };

    return this.storage.conversation_items.findMany(options, context, itemRowMapper);
  }
}
