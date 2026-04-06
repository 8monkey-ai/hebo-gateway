import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type {
  ConversationMetadata,
  ConversationItemInput,
  ConversationEntityWithExtra,
  ConversationItemEntityWithExtra,
  DatabaseSchema,
  StorageQueryOptions,
  Storage,
} from "../../storage/types";
import {
  createRowMapper,
  mergeData,
  parseJson,
  toMilliseconds,
} from "../../storage/dialects/utils";

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

const conversationRowMapper = createRowMapper<ConversationEntityWithExtra<any>>([
  parseJson("metadata"),
  toMilliseconds("created_at"),
]);

const itemRowMapper = createRowMapper<ConversationItemEntityWithExtra<any>>([
  parseJson("data"),
  toMilliseconds("created_at"),
  mergeData("data"),
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
      metadata?: ConversationMetadata;
      items?: ConversationItemInput[];
    } & Partial<TExtra>,
    context: any = {},
  ): Promise<ConversationEntityWithExtra<TExtra>> {
    const id = this.isGreptime ? uuidv4() : uuidv7();
    const metadata = params.metadata ?? null;
    const now = new Date();

    const data = { id, metadata, created_at: now, ...params };
    delete (data as any).items;

    return this.storage.transaction(async (tx) => {
      await this.storage.conversations.insert(data, context, tx);

      const conversation = {
        id,
        created_at: now.getTime(),
        metadata,
        ...params,
      } as ConversationEntityWithExtra<TExtra>;

      if (params.items?.length) {
        await this.addItemsInternal(id, params.items, context, tx);
      }

      return conversation;
    });
  }

  async getConversation(
    id: string,
    context: any = {},
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.storage.conversations.findOne({ id }, context, conversationRowMapper, {
      orderBy: { created_at: "desc" },
    });
  }

  async listConversations(
    params: StorageQueryOptions<TExtra> & {
      order?: "asc" | "desc";
      metadata?: Record<string, string>;
    },
    context: any = {},
  ): Promise<ConversationEntityWithExtra<TExtra>[]> {
    let where = params.where ?? ({} as any);

    if (params.metadata) {
      // Convert { user: "1" } into { "metadata.user": "1" } for jsonExtract support
      const metadataWhere: Record<string, string> = {};
      for (const [key, value] of Object.entries(params.metadata)) {
        metadataWhere[`metadata.${key}`] = value;
      }
      where = { ...where, ...metadataWhere };
    }

    const options: StorageQueryOptions<TExtra> = {
      limit: params.limit,
      after: params.after,
      orderBy: params.orderBy ?? { created_at: params.order ?? "desc" },
      where,
    };
    return this.storage.conversations.find(options, context, conversationRowMapper);
  }

  async updateConversation(
    id: string,
    params: { metadata?: ConversationMetadata } & Partial<TExtra>,
    context: any = {},
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    const conversation = await this.getConversation(id, context);
    if (!conversation) return;

    const meta = params.metadata ?? null;
    const data = {
      ...params,
      metadata: meta,
      created_at: new Date(Number(conversation.created_at)),
    };

    await this.storage.conversations.update(id, data, context);

    return {
      ...conversation,
      ...params,
      metadata: meta,
    } as ConversationEntityWithExtra<TExtra>;
  }

  async deleteConversation(
    id: string,
    context: any = {},
  ): Promise<{ id: string; deleted: boolean }> {
    const { changes } = await this.storage.conversations.remove({ id }, context);
    return { id, deleted: changes > 0 };
  }

  async addItems(
    conversationId: string,
    items: ConversationItemInput[],
    context: any = {},
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined> {
    const conversation = await this.getConversation(conversationId, context);
    if (!conversation) return;

    return this.storage.transaction(async (tx) => {
      return this.addItemsInternal(conversationId, items, context, tx);
    });
  }

  private async addItemsInternal(
    conversationId: string,
    items: ConversationItemInput[],
    context: any,
    tx: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined> {
    const now = Date.now();
    const results: ConversationItemEntityWithExtra<TExtra>[] = [];

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

      await this.storage.conversation_items.insert(data, context, tx);

      results.push({
        ...input,
        id,
        conversation_id: conversationId,
        created_at: createdAt.getTime(),
      } as ConversationItemEntityWithExtra<TExtra>);
    }

    return results;
  }

  async getItem(
    conversationId: string,
    itemId: string,
    context: any = {},
  ): Promise<ConversationItemEntityWithExtra<TExtra> | undefined> {
    return this.storage.conversation_items.findOne(
      { id: itemId, conversation_id: conversationId },
      context,
      itemRowMapper,
    );
  }

  async deleteItem(
    conversationId: string,
    itemId: string,
    context: any = {},
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.storage.transaction(async (tx) => {
      await this.storage.conversation_items.remove(
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
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined> {
    const conversation = await this.getConversation(conversationId, context);
    if (!conversation) return;

    const options: StorageQueryOptions<TExtra> = {
      limit: params.limit,
      after: params.after,
      orderBy: params.orderBy ?? { created_at: params.order ?? "desc" },
      where: { ...params.where, conversation_id: conversationId } as any,
    };

    return this.storage.conversation_items.find(options, context, itemRowMapper);
  }
}
