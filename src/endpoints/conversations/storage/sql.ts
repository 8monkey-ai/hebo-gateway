import { v7 as uuidv7 } from "uuid";

import type {
  Conversation,
  ConversationItem,
  ConversationItemListParams,
  Metadata,
  ResponseInputItem,
} from "../schema";
import type { ConversationStorage } from "./types";
import type { SqlDialect } from "./dialects/types";

interface BaseRow {
  id: string;
  created_at: number | Date;
  metadata?: string | Record<string, unknown> | null;
  conversation_id?: string;
  type?: string;
  data: string | Record<string, unknown>;
}

/**
 * Maps a raw database row to a clean conversation or item object.
 */
function mapRow<T>(row: BaseRow, objectType: string): T {
  const parsedData = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
  let parsedMetadata = row.metadata;

  if (typeof parsedMetadata === "string") {
    parsedMetadata =
      parsedMetadata === "" || parsedMetadata === "{}" ? {} : JSON.parse(parsedMetadata);
  }

  // Standardize timestamp to OpenAI-compliant SECONDS.
  const createdAt =
    row.created_at instanceof Date
      ? Math.floor(row.created_at.getTime() / 1000)
      : Number(row.created_at);

  const out: Record<string, unknown> = {
    id: row.id,
    object: objectType, // Reconstructed in app layer
    created_at: createdAt,
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
    const { types } = this.config;
    const isGreptime = types.index === "TIME";

    const varchar = (len: number) =>
      types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`;
    const timeIndex = isGreptime ? ", TIME INDEX (created_at)" : "";
    const createdAtDefault = types.timestampNow ? `DEFAULT ${types.timestampNow}` : "";

    const createIndex = async (table: string, name: string, cols: string[], seq = false) => {
      if (isGreptime) return;
      const using = seq && types.index !== "B-TREE" ? `USING ${types.index}` : "";
      await this.executor.run(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${using} (${cols.join(", ")})`,
      );
    };

    // Greptime specific column options
    const skippingIdx = isGreptime ? "SKIPPING INDEX" : "";

    await this.executor.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id ${varchar(255)},
        created_at ${types.timestamp} ${createdAtDefault},
        metadata ${types.json},
        PRIMARY KEY (id)
        ${timeIndex}
      )
    `);

    await this.executor.run(`
      CREATE TABLE IF NOT EXISTS conversation_items (
        id ${varchar(255)} ${skippingIdx},
        conversation_id ${varchar(255)},
        created_at ${types.timestamp} ${createdAtDefault},
        type ${varchar(64)},
        data ${types.json},
        PRIMARY KEY (conversation_id${isGreptime ? "" : ", id"})
        ${timeIndex}
      )
    `);

    if (!isGreptime) {
      await createIndex("conversations", "idx_conversations_created_at", ["created_at DESC"], true);
      await createIndex("conversation_items", "idx_items_conv_id", [
        "conversation_id",
        "created_at DESC",
        "id DESC",
      ]);
    }
  }

  async createConversation(params: {
    metadata?: Metadata;
    items?: ResponseInputItem[];
  }): Promise<Conversation> {
    const { placeholder: p } = this.config;
    const id = uuidv7();
    const metadata = params.metadata ?? null;
    const now = Math.floor(Date.now() / 1000);

    // Omit 'object' and 'created_at' to use database-level defaults
    await this.executor.run(`INSERT INTO conversations (id, metadata) VALUES (${p(0)}, ${p(1)})`, [
      id,
      metadata,
    ]);

    const conversation: Conversation = {
      id,
      object: "conversation",
      created_at: now,
      metadata,
    };

    if (params.items?.length) {
      await this.addItems(id, params.items);
    }

    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const { placeholder: p } = this.config;
    const row = await this.executor.get<BaseRow>(`SELECT * FROM conversations WHERE id = ${p(0)}`, [
      id,
    ]);
    return row ? mapRow<Conversation>(row, "conversation") : undefined;
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
    items: ResponseInputItem[],
  ): Promise<ConversationItem[] | undefined> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return undefined;

    const { placeholder: p } = this.config;
    const columns = ["id", "conversation_id", "type", "data"];
    const placeholders = columns.map((_, i) => p(i)).join(", ");
    const sql = `INSERT INTO conversation_items (${columns.join(", ")}) VALUES (${placeholders})`;

    const now = Math.floor(Date.now() / 1000);
    const results: ConversationItem[] = [];

    await this.executor.transaction(async (tx) => {
      for (const input of items) {
        const { id: inputId, type, ...data } = input as { id?: string; type: string };
        const id = inputId || uuidv7();

        const params = [id, conversationId, type, data];
        // eslint-disable-next-line no-await-in-loop
        await tx.run(sql, params);

        results.push({
          ...input,
          id,
          object: "conversation.item",
          created_at: now,
        } as ConversationItem);
      }
    });

    return results;
  }

  async getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    const { placeholder: p } = this.config;
    const row = await this.executor.get<BaseRow>(
      `SELECT * FROM conversation_items WHERE id = ${p(0)} AND conversation_id = ${p(1)}`,
      [itemId, conversationId],
    );
    return row ? mapRow<ConversationItem>(row, "conversation.item") : undefined;
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

    // Since we use UUIDv7, sorting by ID is equivalent to sorting by time.
    // This allows for simple and efficient keyset pagination.
    const sqlParts = [`SELECT * FROM conversation_items WHERE conversation_id = ${p(0)}`];
    if (after) {
      sqlParts.push(`AND id ${op} ${p(1)}`);
    }
    sqlParts.push(`ORDER BY id ${dir} LIMIT ${p(after ? 2 : 1)}`);

    const query = sqlParts.join(" ");
    const args = after ? [conversationId, after, limit] : [conversationId, limit];

    const rows = await this.executor.all<BaseRow>(query, args);
    const results: ConversationItem[] = [];
    for (const row of rows) {
      results.push(mapRow<ConversationItem>(row, "conversation.item"));
    }
    return results;
  }
}

export * from "./dialects/greptime";
export * from "./dialects/mysql";
export * from "./dialects/postgres";
export * from "./dialects/sqlite";
export * from "./dialects/types";
