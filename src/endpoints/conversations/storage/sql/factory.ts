import type { Conversation, ConversationItem } from "../../schema";
import type { ConversationStorage } from "../types";
import type { QueryExecutor, DialectConfig } from "./types";

interface BaseRow {
  id: string;
  object: string;
  created_at: number;
  metadata?: string | Record<string, unknown> | null;
  conversation_id?: string;
  type?: string;
  data: string | Record<string, unknown>;
}

/**
 * Maps a raw database row to a clean conversation or item object.
 */
function mapRow<T>(row: BaseRow): T {
  const parsedData =
    typeof row.data === "string"
      ? (JSON.parse(row.data) as Record<string, unknown>)
      : (row.data as unknown as Record<string, unknown>);

  const parsedMetadata =
    typeof row.metadata === "string"
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : (row.metadata as Record<string, unknown>);

  const out: Record<string, unknown> = {
    id: row.id,
    object: row.object,
    created_at: row.created_at,
  };

  if (row.type) out["type"] = row.type;
  if (parsedMetadata !== undefined) out["metadata"] = parsedMetadata;

  return Object.assign(out, parsedData) as T;
}

export function createSqlStorage(
  executor: QueryExecutor,
  dialect: DialectConfig,
): ConversationStorage & { migrate(): Promise<void> } {
  const { placeholder, types, partitioned } = dialect;

  const varchar = (len: number) => (types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`);

  async function createIndex(table: string, name: string, columns: string[], sequential = false) {
    if (types.index === "none") return;
    const using = sequential && types.index !== "B-TREE" ? `USING ${types.index}` : "";
    await executor.run(
      `CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${using} (${columns.join(", ")})`,
    );
  }

  function getPartitionSql(column: string) {
    if (!partitioned) return "";
    const ranges = "123456789abcdef"
      .split("")
      .map((h) => `${column} < '${h}'`)
      .join(", ");
    return `PARTITION ON COLUMNS (${column}) (${ranges})`;
  }

  /**
   * Helper to perform a bulk insert of conversation items.
   */
  async function insertItems(convId: string, items: ConversationItem[]) {
    if (items.length === 0) return;

    const columns = ["id", "conversation_id", "object", "created_at", "type", "data"];
    const placeholders: string[] = [];
    const params: unknown[] = [];

    for (const item of items) {
      const rowPlaceholders: string[] = [];
      const { id, object, created_at, type, ...rest } = item;

      const values = [id, convId, object, created_at, type, rest];
      for (const val of values) {
        rowPlaceholders.push(placeholder(params.length));
        params.push(val);
      }
      placeholders.push(`(${rowPlaceholders.join(", ")})`);
    }

    const sql = `INSERT INTO conversation_items (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`;
    await executor.run(sql, params);
  }

  return {
    async migrate() {
      const timeIndex = types.timeIndex ? `, TIME INDEX (created_at)` : "";

      await executor.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id ${varchar(255)},
          object ${varchar(64)},
          created_at ${types.int64},
          metadata ${types.json},
          PRIMARY KEY (id)
          ${timeIndex}
        )
        ${getPartitionSql("id")}
      `);

      await executor.run(`
        CREATE TABLE IF NOT EXISTS conversation_items (
          id ${varchar(255)},
          conversation_id ${varchar(255)},
          object ${varchar(64)},
          created_at ${types.int64},
          type ${varchar(64)},
          data ${types.json},
          PRIMARY KEY (conversation_id, id)
          ${timeIndex}
        )
        ${getPartitionSql("conversation_id")}
      `);

      await createIndex("conversations", "idx_conversations_created_at", ["created_at DESC"], true);

      await createIndex(
        "conversation_items",
        "idx_items_conv_id",
        ["conversation_id", "created_at DESC", "id DESC"],
        false,
      );
    },

    async createConversation(conversation, items) {
      await executor.run(
        `INSERT INTO conversations (id, object, created_at, metadata) VALUES (${placeholder(0)}, ${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)})`,
        [conversation.id, conversation.object, conversation.created_at, conversation.metadata],
      );

      if (items && items.length > 0) {
        await insertItems(conversation.id, items);
      }

      return conversation;
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
        [metadata ?? null, id],
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

      await insertItems(conversationId, items);
      return items;
    },

    async getItem(conversationId, itemId) {
      const row = await executor.get<BaseRow>(
        `SELECT * FROM conversation_items WHERE id = ${placeholder(0)} AND conversation_id = ${placeholder(1)}`,
        [itemId, conversationId],
      );
      return row ? mapRow<ConversationItem>(row) : undefined;
    },

    async deleteItem(conversationId, itemId) {
      await executor.run(
        `DELETE FROM conversation_items WHERE id = ${placeholder(0)} AND conversation_id = ${placeholder(1)}`,
        [itemId, conversationId],
      );
      return this.getConversation(conversationId);
    },

    async listItems(conversationId, params) {
      const { after, order, limit } = params;
      const orderDir = order === "asc" ? "ASC" : "DESC";
      const comp = order === "asc" ? ">" : "<";

      let query: string;
      let args: unknown[];

      if (after) {
        query = `
          SELECT t1.*
          FROM conversation_items t1
          LEFT JOIN conversation_items t2 ON t2.id = ${placeholder(0)} AND t2.conversation_id = ${placeholder(1)}
          WHERE t1.conversation_id = ${placeholder(2)}
          AND (t2.id IS NULL OR (t1.created_at ${comp} t2.created_at OR (t1.created_at = t2.created_at AND t1.id ${comp} t2.id)))
          ORDER BY t1.created_at ${orderDir}, t1.id ${orderDir}
          LIMIT ${placeholder(3)}
        `;
        args = [after, conversationId, conversationId, limit];
      } else {
        query = `
          SELECT * FROM conversation_items
          WHERE conversation_id = ${placeholder(0)}
          ORDER BY created_at ${orderDir}, id ${orderDir}
          LIMIT ${placeholder(1)}
        `;
        args = [conversationId, limit];
      }

      const rows = await executor.all<BaseRow>(query, args);
      const items: ConversationItem[] = [];
      for (const row of rows) {
        items.push(mapRow<ConversationItem>(row));
      }
      return items;
    },
  };
}
