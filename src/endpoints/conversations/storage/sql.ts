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
import { createRowMapper, mergeData, parseJson, toSeconds } from "./dialects/utils";

/**
 * Maps a raw database row to a clean conversation or item object.
 */
function mapRow<T>(row: BaseRow, objectType: string): T {
  const mapper = createRowMapper<T>(
    parseJson("data"),
    parseJson("metadata"),
    toSeconds("created_at"),
    mergeData("data"),
    (r) => {
      r["object"] = objectType;
      return r;
    },
  );

  return mapper(row as unknown as Record<string, unknown>);
}

export class SqlStorage implements ConversationStorage {
  readonly dialect: SqlDialect;

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
    const { types, quote: q } = this.config;
    const isGreptime = types.index === "TIME";
    const isMysql = types.index === "B-TREE" && types.varchar !== "TEXT";

    const varchar = (len: number) =>
      types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`;
    const timeIndex = isGreptime ? `, TIME INDEX (${q("created_at")})` : "";

    const createIndex = async (table: string, name: string, cols: string[], seq = false) => {
      if (isGreptime) return;
      const isBrin = types.index === "BRIN";
      const using = seq && types.index !== "B-TREE" ? `USING ${types.index}` : "";
      const ifNotExists = isMysql ? "" : "IF NOT EXISTS";

      const formattedCols = cols
        .map((c) => {
          const [col, dir] = c.split(" ");
          // BRIN doesn't support ASC/DESC
          const effectiveDir = isBrin ? "" : dir;
          return effectiveDir ? `${q(col)} ${effectiveDir}` : q(col);
        })
        .join(", ");

      try {
        await this.executor.run(
          `CREATE INDEX ${ifNotExists} ${q(name)} ON ${q(table)} ${using} (${formattedCols})`,
          [],
        );
      } catch (err: any) {
        if (isMysql && err.message?.includes("Duplicate key name")) return;
        throw err;
      }
    };

    await this.executor.run(
      `
      CREATE TABLE IF NOT EXISTS ${q("conversations")} (
        ${q("id")} ${varchar(255)},
        ${q("created_at")} ${types.timestamp},
        ${q("metadata")} ${types.json},
        PRIMARY KEY (${q("id")})
        ${timeIndex}
      )
    `,
      [],
    );

    await this.executor.run(
      `
      CREATE TABLE IF NOT EXISTS ${q("conversation_items")} (
        ${q("id")} ${varchar(255)}${isGreptime ? " SKIPPING INDEX" : ""},
        ${q("conversation_id")} ${varchar(255)},
        ${q("created_at")} ${types.timestamp},
        ${q("type")} ${varchar(64)},
        ${q("data")} ${types.json},
        PRIMARY KEY (${q("conversation_id")}${isGreptime ? "" : `, ${q("id")}`})
        ${timeIndex}
      )
    `,
      [],
    );

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
    const { placeholder: p, quote: q } = this.config;
    const id = uuidv7();
    const metadata = params.metadata ?? null;
    const now = new Date();

    await this.executor.run(
      `INSERT INTO ${q("conversations")} (${q("id")}, ${q("metadata")}, ${q("created_at")}) VALUES (${p(
        0,
      )}, ${p(1)}, ${p(2)})`,
      [id, metadata, now],
    );

    const conversation: Conversation = {
      id,
      object: "conversation",
      created_at: Math.floor(now.getTime() / 1000),
      metadata,
    };

    if (params.items?.length) {
      await this.addItems(id, params.items);
    }

    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const { placeholder: p, quote: q } = this.config;
    const row = await this.executor.get<BaseRow>(
      `SELECT * FROM ${q("conversations")} WHERE ${q("id")} = ${p(0)}`,
      [id],
    );
    return row ? mapRow<Conversation>(row, "conversation") : undefined;
  }

  async updateConversation(id: string, metadata: Metadata): Promise<Conversation | undefined> {
    const { placeholder: p, quote: q, supportUpdate } = this.config;

    if (supportUpdate === false) {
      // For databases like GreptimeDB, we "update" by inserting a new version with the same primary key and time index.
      const existing = await this.getConversation(id);
      if (!existing) return undefined;

      // Restore millisecond timestamp from seconds
      const createdAt = new Date(Number(existing.created_at) * 1000);

      await this.executor.run(
        `INSERT INTO ${q("conversations")} (${q("id")}, ${q("metadata")}, ${q("created_at")}) VALUES (${p(
          0,
        )}, ${p(1)}, ${p(2)})`,
        [id, metadata ?? null, createdAt],
      );
    } else {
      await this.executor.run(
        `UPDATE ${q("conversations")} SET ${q("metadata")} = ${p(0)} WHERE ${q("id")} = ${p(1)}`,
        [metadata ?? null, id],
      );
    }
    return this.getConversation(id);
  }

  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    const { placeholder: p, quote: q } = this.config;
    const { changes } = await this.executor.run(
      `DELETE FROM ${q("conversations")} WHERE ${q("id")} = ${p(0)}`,
      [id],
    );
    return { id, deleted: changes > 0 };
  }

  async addItems(
    conversationId: string,
    items: ResponseInputItem[],
  ): Promise<ConversationItem[] | undefined> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return undefined;

    const { placeholder: p, quote: q } = this.config;
    const columns = ["id", "conversation_id", "type", "data", "created_at"];

    const placeholders = columns.map((_, i) => p(i)).join(", ");
    const sql = `INSERT INTO ${q("conversation_items")} (${columns
      .map((c) => q(c))
      .join(", ")}) VALUES (${placeholders})`;

    const now = Date.now();
    const results: ConversationItem[] = [];

    await this.executor.transaction(async (tx) => {
      let i = 0;
      for (const input of items) {
        const { id: inputId, type, ...data } = input as { id?: string; type: string };
        const id = inputId || uuidv7();
        // Add slight offset to ensure unique (PK + TS) even in batch.
        const createdAt = new Date(now + i++);

        const params = [id, conversationId, type, data, createdAt];

        // eslint-disable-next-line no-await-in-loop
        await tx.run(sql, params);

        results.push({
          ...input,
          id,
          object: "conversation.item",
          created_at: Math.floor(createdAt.getTime() / 1000),
        } as ConversationItem);
      }
    });

    return results;
  }

  async getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    const { placeholder: p, quote: q } = this.config;
    const row = await this.executor.get<BaseRow>(
      `SELECT * FROM ${q("conversation_items")} WHERE ${q("id")} = ${p(0)} AND ${q(
        "conversation_id",
      )} = ${p(1)}`,
      [itemId, conversationId],
    );
    return row ? mapRow<ConversationItem>(row, "conversation.item") : undefined;
  }

  async deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined> {
    const { placeholder: p, quote: q } = this.config;
    await this.executor.run(
      `DELETE FROM ${q("conversation_items")} WHERE ${q("id")} = ${p(0)} AND ${q(
        "conversation_id",
      )} = ${p(1)}`,
      [itemId, conversationId],
    );
    return this.getConversation(conversationId);
  }

  async listItems(
    conversationId: string,
    params: ConversationItemListParams,
  ): Promise<ConversationItem[] | undefined> {
    const { after, order, limit } = params;
    const { placeholder: p, quote: q, limitAsLiteral } = this.config;

    const isAsc = order === "asc";
    const op = isAsc ? ">" : "<";
    const dir = isAsc ? "ASC" : "DESC";

    const sqlParts = [
      `SELECT * FROM ${q("conversation_items")} WHERE ${q("conversation_id")} = ${p(0)}`,
    ];
    let nextIdx = 1;
    if (after) {
      sqlParts.push(`AND ${q("id")} ${op} ${p(nextIdx++)}`);
    }

    const limitVal = Number(limit);
    if (limitAsLiteral) {
      sqlParts.push(`ORDER BY ${q("id")} ${dir} LIMIT ${limitVal}`);
    } else {
      sqlParts.push(`ORDER BY ${q("id")} ${dir} LIMIT ${p(nextIdx++)}`);
    }

    const query = sqlParts.join(" ");
    const args: unknown[] = [conversationId];
    if (after) args.push(after);
    if (!limitAsLiteral && limit !== undefined) args.push(limitVal);

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
