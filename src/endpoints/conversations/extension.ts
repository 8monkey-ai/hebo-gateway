import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type {
  DatabaseSchema,
  StorageClient,
  StorageExtension,
  TableClient,
  DatabaseClient,
} from "../../storage/types";
import {
  createRowMapper,
  mergeData,
  parseJson,
  toMilliseconds,
} from "../../storage/dialects/utils";
import type { Conversation, ConversationItem } from "./schema";

export type ConversationSchema = {
  conversations: TableClient<Conversation>;
  conversation_items: TableClient<ConversationItem>;
} & DatabaseClient;

export const getConversationSchema = (isGreptime: boolean): DatabaseSchema => ({
  conversations: {
    id: { type: "id" },
    created_at: { type: "timestamp" },
    metadata: { type: "json" },
    $partitionBy: ["id"],
    $indexes: [["created_at DESC", "id DESC"]],
  },
  conversation_items: {
    id: { type: "id", skippingIndex: isGreptime },
    conversation_id: { type: "id" },
    created_at: { type: "timestamp" },
    type: { type: "shorttext" },
    data: { type: "json" },
    $primaryKey: isGreptime ? ["conversation_id"] : ["conversation_id", "id"],
    $partitionBy: ["conversation_id"],
    $indexes: [["conversation_id", "created_at DESC", "id DESC"]],
    $memoryLimit: 10000,
  },
});

export const conversationRowMapper = createRowMapper<Conversation>([
  parseJson("metadata"),
  toMilliseconds("created_at"),
  (row) => {
    row["object"] = "conversation";
    return row;
  },
]);

export const itemRowMapper = createRowMapper<ConversationItem>([
  parseJson("data"),
  toMilliseconds("created_at"),
  mergeData("data"),
  (row) => {
    row["object"] = "conversation.item";
    return row;
  },
]);

/**
 * Extension that adds transparent domain expertise to the storage client.
 * Intercepts standard CRUD operations to handle IDs, timestamps, and row mapping.
 */
export const conversationExtension = (
  storage: StorageClient,
): StorageExtension<ConversationSchema> => {
  const dialect = storage.dialect as { config?: { types?: { index?: string } } };
  const isGreptime = dialect?.config?.types?.index === "TIME";
  const s = storage as unknown as StorageClient<ConversationSchema>;

  return {
    name: "conversations",
    schema: getConversationSchema(isGreptime),

    query: {
      conversations: {
        create({ args, query, context }) {
          const { items, ...params } = args as { items?: unknown[] } & Record<string, unknown>;
          const id = (params["id"] as string | undefined) ?? (isGreptime ? uuidv4() : uuidv7());
          const now = (params["created_at"] as Date | undefined) ?? new Date();
          const metadata = params["metadata"] ?? null;

          return s.transaction(async (tx) => {
            await query({ ...params, id, created_at: now, metadata }, tx);

            if (items?.length) {
              const nowMs = Date.now();
              let offset = 0;
              await Promise.all(
                items.map((input: unknown) =>
                  s.conversation_items.create(
                    {
                      ...(input as Record<string, unknown>),
                      conversation_id: id,
                      created_at: new Date(nowMs + offset++),
                    },
                    context,
                    tx,
                  ),
                ),
              );
            }

            // Standard create returns changes, but we return the mapped entity
            // to provide a better developer experience for the domain.
            const result = await s.conversations.findFirst({ id }, context, undefined, {}, tx);
            if (!result) throw new Error("Failed to create conversation");
            return conversationRowMapper(result as unknown as Record<string, unknown>);
          });
        },

        async update({ args, query, context }) {
          const { id, data } = args as { id: string; data: Record<string, unknown> };
          const conversation = await s.conversations.findFirst({ id }, context);
          if (!conversation) return null;

          // Expertise: Preserve original created_at
          const createdAt = new Date(conversation.created_at);
          const updateData = { ...data, created_at: createdAt };

          await query({ id, data: updateData });

          const result = await s.conversations.findFirst({ id }, context);
          if (!result) return null;
          return conversationRowMapper(result as unknown as Record<string, unknown>);
        },

        async findMany({ args, query }) {
          const rows = (await query(args)) as Record<string, unknown>[];
          return rows.map((r) => conversationRowMapper(r));
        },

        async findFirst({ args, query }) {
          const row = (await query(args)) as Record<string, unknown> | undefined;
          return row ? conversationRowMapper(row) : undefined;
        },
      },

      conversation_items: {
        async create({ args, query }) {
          const params = args as Record<string, unknown>;
          const id = (params["id"] as string | undefined) ?? uuidv7();
          const created_at = (params["created_at"] as Date | undefined) ?? new Date();
          // Auto-map input to 'data' column if it's not already there
          const data = { ...params, id, created_at, data: params["data"] ?? params };
          await query(data);
          return itemRowMapper(data as Record<string, unknown>);
        },

        async findMany({ args, query }) {
          const rows = (await query(args)) as Record<string, unknown>[];
          return rows.map((r) => itemRowMapper(r));
        },

        async findFirst({ args, query }) {
          const row = (await query(args)) as Record<string, unknown> | undefined;
          return row ? itemRowMapper(row) : undefined;
        },
      },
    },
  };
};
