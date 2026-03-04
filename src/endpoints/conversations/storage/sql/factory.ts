import type { Conversation, ConversationItem } from "../../schema";
import type { ConversationStorage } from "../types";
import type { QueryExecutor, DialectConfig } from "./types";

interface BaseRow {
  id: string;
  object: string;
  created_at: number;
  metadata?: string | Record<string, unknown>;
  conversation_id?: string;
  type?: string;
  data: string | Record<string, unknown>;
}

function mapRow<T>(row: BaseRow): T {
  const { conversation_id: _, data, metadata, ...rest } = row;

  const parsedData =
    typeof data === "string"
      ? (JSON.parse(data) as Record<string, unknown>)
      : (data as unknown as Record<string, unknown>);

  const parsedMetadata =
    typeof metadata === "string"
      ? (JSON.parse(metadata) as Record<string, unknown>)
      : (metadata as Record<string, unknown>);

  return {
    ...rest,
    ...(parsedMetadata ? { metadata: parsedMetadata } : {}),
    ...parsedData,
  } as T;
}

const defaultIndexSql = (table: string, name: string, columns: string[]) =>
  `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columns.join(", ")})`;

export function createSqlStorage(
  executor: QueryExecutor,
  dialect: DialectConfig,
): ConversationStorage & { init(): Promise<void> } {
  const { placeholder, idType, objectType, jsonType, createdAtType, createIndexSql } = dialect;

  const indexSql = createIndexSql ?? defaultIndexSql;

  return {
    async init() {
      await executor.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id ${idType} PRIMARY KEY,
          object ${objectType},
          created_at ${createdAtType},
          metadata ${jsonType}
        )
      `);

      await executor.run(`
        CREATE TABLE IF NOT EXISTS conversation_items (
          id ${idType} PRIMARY KEY,
          conversation_id ${idType},
          object ${objectType},
          created_at ${createdAtType},
          type ${objectType},
          data ${jsonType}
        )
      `);

      await executor.run(
        indexSql("conversations", "idx_conversations_created_at", ["created_at DESC"]),
      );
      await executor.run(
        indexSql("conversation_items", "idx_items_conv_id_created_at", [
          "conversation_id",
          "created_at DESC",
          "id DESC",
        ]),
      );
    },

    createConversation(conversation, items) {
      return executor.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO conversations (id, object, created_at, metadata) VALUES (${placeholder(0)}, ${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)})`,
          [conversation.id, conversation.object, conversation.created_at, conversation.metadata],
        );

        if (items && items.length > 0) {
          await Promise.all(
            items.map((item) => {
              const { id, object, created_at, ...rest } = item;
              return tx.run(
                `INSERT INTO conversation_items (id, conversation_id, object, created_at, type, data) VALUES (${placeholder(0)}, ${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)}, ${placeholder(4)}, ${placeholder(5)})`,
                [id, conversation.id, object, created_at, item.type, rest],
              );
            }),
          );
        }

        return conversation;
      });
    },

    async getConversation(id) {
      const row = await executor.get<BaseRow>(
        `SELECT * FROM conversations WHERE id = ${placeholder(0)}`,
        [id],
      );
      return row ? mapRow<Conversation>(row) : undefined;
    },

    async updateConversation(id, metadata) {
      await executor.run(
        `UPDATE conversations SET metadata = ${placeholder(0)} WHERE id = ${placeholder(1)}`,
        [metadata, id],
      );
      return this.getConversation(id);
    },

    async deleteConversation(id) {
      const { changes } = await executor.run(
        `DELETE FROM conversations WHERE id = ${placeholder(0)}`,
        [id],
      );
      return { id, deleted: changes > 0 };
    },

    async addItems(conversationId, items) {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) return;

      await executor.transaction(async (tx) => {
        await Promise.all(
          items.map((item) => {
            const { id, object, created_at, ...rest } = item;
            return tx.run(
              `INSERT INTO conversation_items (id, conversation_id, object, created_at, type, data) VALUES (${placeholder(0)}, ${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)}, ${placeholder(4)}, ${placeholder(5)})`,
              [id, conversationId, object, created_at, item.type, rest],
            );
          }),
        );
      });
      return items;
    },

    async getItem(conversationId, itemId) {
      const row = await executor.get<BaseRow>(
        `SELECT * FROM conversation_items WHERE conversation_id = ${placeholder(0)} AND id = ${placeholder(1)}`,
        [conversationId, itemId],
      );
      return row ? mapRow<ConversationItem>(row) : undefined;
    },

    async deleteItem(conversationId, itemId) {
      await executor.run(
        `DELETE FROM conversation_items WHERE conversation_id = ${placeholder(0)} AND id = ${placeholder(1)}`,
        [conversationId, itemId],
      );
      return this.getConversation(conversationId);
    },

    async listItems(conversationId, params) {
      const { after, order, limit } = params;
      let query = `SELECT * FROM conversation_items WHERE conversation_id = ${placeholder(0)}`;
      const args: unknown[] = [conversationId];

      if (after) {
        const afterItem = await this.getItem(conversationId, after);
        if (afterItem) {
          const comp = order === "asc" ? ">" : "<";
          query += ` AND (created_at ${comp} ${placeholder(args.length)} OR (created_at = ${placeholder(args.length + 1)} AND id ${comp} ${placeholder(args.length + 2)}))`;
          args.push(afterItem.created_at, afterItem.created_at, afterItem.id);
        }
      }

      query += ` ORDER BY created_at ${order === "asc" ? "ASC" : "DESC"}, id ${order === "asc" ? "ASC" : "DESC"}`;
      query += ` LIMIT ${placeholder(args.length)}`;
      args.push(limit);

      const rows = await executor.all<BaseRow>(query, args);
      return rows.map((row) => mapRow<ConversationItem>(row));
    },
  };
}
