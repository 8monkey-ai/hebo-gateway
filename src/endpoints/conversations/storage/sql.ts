import type {
  Conversation,
  ConversationItem,
  ConversationItemListParams,
  Metadata,
} from "../schema";
import type { ConversationStorage } from "./types";
import type { SqlDialect } from "./dialects/types";

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
  const parsedData = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
  let parsedMetadata = row.metadata;

  if (typeof parsedMetadata === "string") {
    parsedMetadata =
      parsedMetadata === "" || parsedMetadata === "{}" ? {} : JSON.parse(parsedMetadata);
  }

  const out: Record<string, unknown> = {
    id: row.id,
    object: row.object,
    created_at: row.created_at,
  };

  if (row.type) out["type"] = row.type;
  if (parsedMetadata !== undefined) out["metadata"] = parsedMetadata;

  return Object.assign(out, parsedData) as T;
}

export class SqlStorage implements ConversationStorage {
  private dialect: SqlDialect;

  constructor(options: SqlDialect | { dialect: SqlDialect }) {
    if ("executor" in options) {
      this.dialect = options;
    } else {
      this.dialect = options.dialect;
    }
  }

  private get executor() {
    return this.dialect.executor;
  }
  private get config() {
    return this.dialect.config;
  }

  async migrate() {
    const { types, partitioned } = this.config;
    const varchar = (len: number) =>
      types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`;
    const timeIndex = types.index === "TIME" ? ", TIME INDEX (created_at)" : "";

    const getPartitionSql = (column: string) => {
      if (!partitioned) return "";
      const hex = "123456789abcdef".split("");
      const ranges = hex.map((h) => `${column} < '${h}'`).join(", ");
      return `PARTITION ON COLUMNS (${column}) (${ranges})`;
    };

    const createIndex = async (table: string, name: string, cols: string[], seq = false) => {
      if (types.index === "TIME") return;
      const using = seq && types.index !== "B-TREE" ? `USING ${types.index}` : "";
      await this.executor.run(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${using} (${cols.join(", ")})`,
      );
    };

    await this.executor.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id ${varchar(255)},
        object ${varchar(64)},
        created_at ${types.timestamp},
        metadata ${types.json},
        PRIMARY KEY (id)
        ${timeIndex}
      )
      ${getPartitionSql("id")}
    `);

    await this.executor.run(`
      CREATE TABLE IF NOT EXISTS conversation_items (
        id ${varchar(255)},
        conversation_id ${varchar(255)},
        object ${varchar(64)},
        created_at ${types.timestamp},
        type ${varchar(64)},
        data ${types.json},
        PRIMARY KEY (conversation_id, id)
        ${timeIndex}
      )
      ${getPartitionSql("conversation_id")}
    `);

    await createIndex("conversations", "idx_conversations_created_at", ["created_at DESC"], true);
    await createIndex("conversation_items", "idx_items_conv_id", [
      "conversation_id",
      "created_at DESC",
      "id DESC",
    ]);
  }

  async createConversation(
    conversation: Conversation,
    items?: ConversationItem[],
  ): Promise<Conversation> {
    const { placeholder: p } = this.config;
    await this.executor.run(
      `INSERT INTO conversations (id, object, created_at, metadata) VALUES (${p(0)}, ${p(1)}, ${p(2)}, ${p(3)})`,
      [conversation.id, conversation.object, conversation.created_at, conversation.metadata],
    );

    if (items?.length) {
      await this.insertItems(conversation.id, items);
    }

    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const { placeholder: p } = this.config;
    const row = await this.executor.get<BaseRow>(`SELECT * FROM conversations WHERE id = ${p(0)}`, [
      id,
    ]);
    return row ? mapRow<Conversation>(row) : undefined;
  }

  async updateConversation(id: string, metadata: Metadata): Promise<Conversation | undefined> {
    const { placeholder: p } = this.config;
    await this.executor.run(`UPDATE conversations SET metadata = ${p(0)} WHERE id = ${p(1)}`, [
      metadata ?? null,
      id,
    ]);
    return this.getConversation(id);
  }

  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    const { placeholder: p } = this.config;
    const { changes } = await this.executor.run(`DELETE FROM conversations WHERE id = ${p(0)}`, [
      id,
    ]);
    return { id, deleted: changes > 0 };
  }

  async addItems(
    conversationId: string,
    items: ConversationItem[],
  ): Promise<ConversationItem[] | undefined> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return undefined;

    await this.insertItems(conversationId, items);
    return items;
  }

  async getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    const { placeholder: p } = this.config;
    const row = await this.executor.get<BaseRow>(
      `SELECT * FROM conversation_items WHERE id = ${p(0)} AND conversation_id = ${p(1)}`,
      [itemId, conversationId],
    );
    return row ? mapRow<ConversationItem>(row) : undefined;
  }

  async deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined> {
    const { placeholder: p } = this.config;
    await this.executor.run(
      `DELETE FROM conversation_items WHERE id = ${p(0)} AND conversation_id = ${p(1)}`,
      [itemId, conversationId],
    );
    return this.getConversation(conversationId);
  }

  async listItems(
    conversationId: string,
    params: ConversationItemListParams,
  ): Promise<ConversationItem[] | undefined> {
    const { after, order, limit } = params;
    const { placeholder: p } = this.config;

    const isAsc = order === "asc";
    const op = isAsc ? ">" : "<";
    const dir = isAsc ? "ASC" : "DESC";

    const cursor = after ? await this.getItem(conversationId, after) : undefined;

    // Build the query modularly to avoid repetition while keeping SQL static for caching
    const sqlParts = [`SELECT * FROM conversation_items WHERE conversation_id = ${p(0)}`];
    if (cursor) {
      sqlParts.push(
        `AND (created_at ${op} ${p(1)} OR (created_at = ${p(2)} AND id ${op} ${p(3)}))`,
      );
    }
    sqlParts.push(`ORDER BY created_at ${dir}, id ${dir} LIMIT ${p(cursor ? 4 : 1)}`);

    const query = sqlParts.join(" ");
    const args = cursor
      ? [conversationId, cursor.created_at, cursor.created_at, cursor.id, limit]
      : [conversationId, limit];

    const rows = await this.executor.all<BaseRow>(query, args);
    const items: ConversationItem[] = [];
    for (const row of rows) {
      items.push(mapRow<ConversationItem>(row));
    }
    return items;
  }

  private async insertItems(convId: string, items: ConversationItem[]) {
    if (items.length === 0) return;
    const { placeholder: p } = this.config;

    const columns = ["id", "conversation_id", "object", "created_at", "type", "data"];
    const placeholders = columns.map((_, i) => p(i)).join(", ");
    const sql = `INSERT INTO conversation_items (${columns.join(", ")}) VALUES (${placeholders})`;

    await this.executor.transaction(async (tx) => {
      for (const item of items) {
        const { id, object, created_at, type, ...data } = item;
        const params = [id, convId, object, created_at, type, data];
        // eslint-disable-next-line no-await-in-loop
        await tx.run(sql, params);
      }
    });
  }
}

export * from "./dialects/greptime";
export * from "./dialects/mysql";
export * from "./dialects/postgres";
export * from "./dialects/sqlite";
export * from "./dialects/types";
