import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import type {
  ConversationStorage,
  ConversationEntity,
  ConversationItemEntity,
  ConversationMetadata,
  ConversationItemInput,
  ConversationQueryOptions,
} from "./types";
import type { SqlDialect } from "./dialects/types";

import { createRowMapper, mergeData, parseJson, toMilliseconds } from "./dialects/utils";

/**
 * Maps a raw database row to a clean conversation or item entity.
 */
function mapRow<T>(row: Record<string, unknown>): T {
  const mapper = createRowMapper<T>([
    parseJson("data"),
    parseJson("metadata"),
    toMilliseconds("created_at"),
    mergeData("data"),
  ]);

  return mapper(row);
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
    const { types, quote: q, supportCreateIndexIfNotExists } = this.config;
    const isTimeIndex = types.index === "TIME";

    const varchar = (len: number) =>
      types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`;
    const timeIndex = isTimeIndex ? `, TIME INDEX (${q("created_at")})` : "";
    const partition = (cols: string[]) =>
      this.config.partitionClause
        ? ` ${this.config.partitionClause(cols.map((col) => q(col)))}`
        : "";

    const createIndex = async (table: string, name: string, cols: string[], seq = false) => {
      const isBrin = types.index === "BRIN";
      const using = seq && types.index !== "B-TREE" ? `USING ${types.index}` : "";
      const ifNotExists = supportCreateIndexIfNotExists ? "IF NOT EXISTS" : "";

      const formattedCols = cols
        .map((c) => {
          const parts = c.split(" ");
          const col = parts[0]!;
          const dir = parts[1];
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
      } catch (err: unknown) {
        if (
          !supportCreateIndexIfNotExists &&
          err instanceof Error &&
          err.message?.includes("Duplicate key name")
        ) {
          return;
        }
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
      )${partition(["id"])}
    `,
      [],
    );

    await this.executor.run(
      `
      CREATE TABLE IF NOT EXISTS ${q("conversation_items")} (
        ${q("id")} ${varchar(255)}${isTimeIndex ? " SKIPPING INDEX" : ""},
        ${q("conversation_id")} ${varchar(255)},
        ${q("created_at")} ${types.timestamp},
        ${q("type")} ${varchar(64)},
        ${q("data")} ${types.json},
        PRIMARY KEY (${q("conversation_id")}${isTimeIndex ? "" : `, ${q("id")}`})
        ${timeIndex}
      )${partition(["conversation_id"])}
    `,
      [],
    );

    if (!isTimeIndex) {
      await createIndex("conversations", "idx_conversations_created_at", ["created_at DESC"], true);
      await createIndex("conversation_items", "idx_items_conv_id", ["conversation_id", "id DESC"]);
    }
  }

  async createConversation(params: {
    metadata?: ConversationMetadata;
    items?: ConversationItemInput[];
  }): Promise<ConversationEntity> {
    const { placeholder: p, quote: q } = this.config;
    const isGreptime = this.config.types.index === "TIME";
    const id = isGreptime ? uuidv4() : uuidv7();
    const metadata = params.metadata ?? null;
    const now = new Date();

    await this.executor.run(
      `INSERT INTO ${q("conversations")} (${q("id")}, ${q("metadata")}, ${q("created_at")}) VALUES (${p(
        0,
      )}, ${p(1)}, ${p(2)})`,
      [id, metadata, now],
    );

    const conversation: ConversationEntity = {
      id,
      created_at: now.getTime(),
      metadata,
    };

    if (params.items?.length) {
      await this.addItems(id, params.items);
    }

    return conversation;
  }

  async getConversation(id: string): Promise<ConversationEntity | undefined> {
    const { placeholder: p, quote: q } = this.config;
    const row = await this.executor.get<Record<string, unknown>>(
      `SELECT * FROM ${q("conversations")} WHERE ${q("id")} = ${p(0)} ORDER BY ${q(
        "created_at",
      )} DESC LIMIT 1`,
      [id],
    );
    return row ? mapRow<ConversationEntity>(row) : undefined;
  }

  async updateConversation(
    id: string,
    metadata: ConversationMetadata,
  ): Promise<ConversationEntity | undefined> {
    const { placeholder: p, quote: q, upsertSuffix } = this.config;

    // Unified approach: Fetch original created_at to verify existence and preserve it.
    // 1. Existence check: Ensure the conversation exists before updating (returning undefined if missing).
    //    This prevents clients from accidentally creating "zombie" conversations with custom IDs.
    // 2. Consistency: Standard SQL (Postgres/MySQL/SQLite) preserves the original creation timestamp.
    // 3. Deduplication: GreptimeDB requires the EXACT same Time Index (created_at) to deduplicate the row.
    const row = await this.executor.get<{ created_at: Date | number }>(
      `SELECT ${q("created_at")} FROM ${q("conversations")} WHERE ${q("id")} = ${p(
        0,
      )} ORDER BY ${q("created_at")} DESC LIMIT 1`,
      [id],
    );

    if (!row) return undefined;
    const createdAt = row.created_at;

    const pk = ["id"];
    const updateCols = ["metadata"];
    const suffix = upsertSuffix?.(q, pk, updateCols) ?? "";

    await this.executor.run(
      `INSERT INTO ${q("conversations")} (${q("id")}, ${q("metadata")}, ${q("created_at")}) VALUES (${p(
        0,
      )}, ${p(1)}, ${p(2)}) ${suffix}`,
      [id, metadata ?? null, createdAt],
    );

    return {
      id,
      created_at: createdAt instanceof Date ? createdAt.getTime() : Number(createdAt),
      metadata: metadata ?? null,
    };
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
    items: ConversationItemInput[],
  ): Promise<ConversationItemEntity[] | undefined> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) return undefined;

    const { placeholder: p, quote: q } = this.config;
    const columns = ["id", "conversation_id", "type", "data", "created_at"];

    const placeholders = columns.map((_, i) => p(i)).join(", ");
    const sql = `INSERT INTO ${q("conversation_items")} (${columns
      .map((c) => q(c))
      .join(", ")}) VALUES (${placeholders})`;

    const now = Date.now();
    const results: ConversationItemEntity[] = [];

    await this.executor.transaction(async (tx) => {
      let i = 0;
      for (const input of items) {
        const { id: inputId, type } = input;
        const id = inputId ?? uuidv7();
        // Add slight offset to ensure unique (PK + TS) even in batch.
        const createdAt = new Date(now + i++);

        // eslint-disable-next-line no-await-in-loop
        await tx.run(sql, [id, conversationId, type, input, createdAt]);

        const item = input as ConversationItemEntity;
        item.id = id;
        item.conversation_id = conversationId;
        item.created_at = createdAt.getTime();

        results.push(item);
      }
    });

    return results;
  }

  async getItem(
    conversationId: string,
    itemId: string,
  ): Promise<ConversationItemEntity | undefined> {
    const { placeholder: p, quote: q } = this.config;
    const row = await this.executor.get<Record<string, unknown>>(
      `SELECT * FROM ${q("conversation_items")} WHERE ${q("id")} = ${p(0)} AND ${q(
        "conversation_id",
      )} = ${p(1)}`,
      [itemId, conversationId],
    );
    return row ? mapRow<ConversationItemEntity>(row) : undefined;
  }

  async deleteItem(
    conversationId: string,
    itemId: string,
  ): Promise<ConversationEntity | undefined> {
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
    params: ConversationQueryOptions,
  ): Promise<ConversationItemEntity[] | undefined> {
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

    const rows = await this.executor.all<Record<string, unknown>>(query, args);
    const results: ConversationItemEntity[] = [];
    for (const row of rows) {
      results.push(mapRow<ConversationItemEntity>(row));
    }
    return results;
  }
}

export * from "./dialects/greptime";
export * from "./dialects/mysql";
export * from "./dialects/postgres";
export * from "./dialects/sqlite";
export * from "./dialects/types";
