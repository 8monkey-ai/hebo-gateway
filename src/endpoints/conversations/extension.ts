import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type { DatabaseSchema, Storage, StorageExtension } from "../../storage/types";
import { createRowMapper, mergeData, parseJson, toSeconds } from "../../storage/dialects/utils";
import type { Conversation, ConversationItem } from "./schema";

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
  toSeconds("created_at"),
  (row) => {
    row.object = "conversation";
    return row;
  },
]);

export const itemRowMapper = createRowMapper<ConversationItem>([
  parseJson("data"),
  toSeconds("created_at"),
  mergeData("data"),
  (row) => {
    row.object = "conversation.item";
    return row;
  },
]);

/**
 * Extension that adds transparent domain expertise to the storage client.
 * Intercepts standard CRUD operations to handle IDs, timestamps, and row mapping.
 */
export const conversationExtension = (storage: Storage): StorageExtension => {
  const isGreptime = storage.dialect?.config?.types?.index === "TIME";

  return {
    name: "conversations",
    schema: getConversationSchema(isGreptime),

    query: {
      conversations: {
        create({ args, query, context }) {
          const { items, ...params } = args;
          const id = params.id ?? (isGreptime ? uuidv4() : uuidv7());
          const now = params.created_at ?? new Date();
          const metadata = params.metadata ?? null;

          return storage.transaction(async (tx) => {
            await query({ ...params, id, created_at: now, metadata }, tx);

            if (items?.length) {
              const nowMs = Date.now();
              let offset = 0;
              await Promise.all(
                items.map((input: any) =>
                  storage.conversation_items.create(
                    {
                      ...input,
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
            const result = await storage.conversations.findFirst(
              { id },
              context,
              undefined,
              {},
              tx,
            );
            return conversationRowMapper(result);
          });
        },

        async update({ args, query, context }) {
          const { id, data } = args;
          const conversation = await storage.conversations.findFirst({ id }, context);
          if (!conversation) return null;

          // Expertise: Preserve original created_at
          const createdAt = new Date(Number(conversation.created_at) * 1000);
          const updateData = { ...data, created_at: createdAt };

          await query({ id, data: updateData });

          const result = await storage.conversations.findFirst({ id }, context);
          return conversationRowMapper(result);
        },

        async findMany({ args, query }) {
          const rows = await query(args);
          return rows.map((r: any) => conversationRowMapper(r));
        },

        async findFirst({ args, query }) {
          const row = await query(args);
          return row ? conversationRowMapper(row) : undefined;
        },
      },

      conversation_items: {
        async create({ args, query }) {
          const id = args.id ?? uuidv7();
          const created_at = args.created_at ?? new Date();
          // Auto-map input to 'data' column if it's not already there
          const data = { ...args, id, created_at, data: args.data ?? args };
          await query(data);
          return itemRowMapper(data);
        },

        async findMany({ args, query }) {
          const rows = await query(args);
          return rows.map((r: any) => itemRowMapper(r));
        },

        async findFirst({ args, query }) {
          const row = await query(args);
          return row ? itemRowMapper(row) : undefined;
        },
      },
    },
  };
};
