import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import type {
  ConversationStorage,
  ConversationEntity,
  ConversationItemEntity,
  ConversationMetadata,
  ConversationItemInput,
  ConversationQueryOptions,
} from "./types";
import type { SqlDialect, QueryExecutor } from "./dialects/types";

import { createRowMapper, mergeData, parseJson, toMilliseconds } from "./dialects/utils";

const rowMapper = createRowMapper<any>([
  parseJson("data"),
  parseJson("metadata"),
  toMilliseconds("created_at"),
  mergeData("data"),
]);

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
    const withClause = isTimeIndex ? ` WITH ('merge_mode'='last_non_null')` : "";
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
      )${partition(["id"])}${withClause}
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
      )${partition(["conversation_id"])}${withClause}
    `,
      [],
    );

    if (!isTimeIndex) {
      await createIndex(
        "conversations",
        "idx_conversations_created_at",
        ["created_at DESC", "id DESC"],
        true,
      );
      await createIndex("conversation_items", "idx_items_conv_id", [
        "conversation_id",
        "created_at DESC",
        "id DESC",
      ]);
    }
  }

  createConversation(params: {
    metadata?: ConversationMetadata;
    items?: ConversationItemInput[];
  }): Promise<ConversationEntity> {
    const { placeholder: p, quote: q } = this.config;
    const isGreptime = this.config.types.index === "TIME";
    const id = isGreptime ? uuidv4() : uuidv7();
    const metadata = params.metadata ?? null;
    const now = new Date();

    return this.executor.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO ${q("conversations")} (${q("id")}, ${q("metadata")}, ${q("created_at")}) ` +
          `VALUES (${p(0)}, ${p(1)}, ${p(2)})`,
        [id, metadata, now],
      );

      const conversation: ConversationEntity = {
        id,
        created_at: now.getTime(),
        metadata,
      };

      if (params.items?.length) {
        await this.addItemsInternal(id, params.items, true, tx);
      }

      return conversation;
    });
  }

  getConversation(id: string): Promise<ConversationEntity | undefined> {
    return this.getConversationInternal(id, this.executor);
  }

  private async getConversationInternal(
    id: string,
    executor: QueryExecutor,
  ): Promise<ConversationEntity | undefined> {
    const { placeholder: p, quote: q, selectJson: sj } = this.config;
    const row = await executor.get<Record<string, unknown>>(
      `SELECT ${q("id")}, ${q("created_at")}, ${sj(q("metadata"))} as ${q("metadata")} FROM ${q(
        "conversations",
      )} WHERE ${q("id")} = ${p(0)} ORDER BY ${q("created_at")} DESC LIMIT 1`,
      [id],
    );
    return row ? (rowMapper(row) as ConversationEntity) : undefined;
  }

  async listConversations(params: ConversationQueryOptions): Promise<ConversationEntity[]> {
    const { after, order, limit, metadata } = params;
    const { placeholder: p, quote: q, selectJson: sj, limitAsLiteral } = this.config;

    const isAsc = order === "asc";
    const dir = isAsc ? "ASC" : "DESC";

    const sqlParts = [
      `SELECT c.${q("id")}, c.${q("created_at")}, ${sj(`c.${q("metadata")}`)} as ${q(
        "metadata",
      )} FROM ${q("conversations")} c WHERE 1=1`,
    ];
    const args: unknown[] = [];
    let nextIdx = 0;

    // Filter by metadata
    if (metadata && Object.keys(metadata).length > 0) {
      for (const [key, value] of Object.entries(metadata)) {
        const extractExpr = this.config.jsonExtract(`c.${q("metadata")}`, key);
        sqlParts.push(`AND ${extractExpr} = ${p(nextIdx++)}`);
        args.push(value);
      }
    }

    if (after) {
      const op = isAsc ? ">" : "<";
      sqlParts.push(
        `AND EXISTS (SELECT 1 FROM ${q("conversations")} _cursor WHERE _cursor.${q("id")} = ${p(
          nextIdx++,
        )} AND (c.${q("created_at")} ${op} _cursor.${q("created_at")} OR (c.${q(
          "created_at",
        )} = _cursor.${q("created_at")} AND c.${q("id")} ${op} _cursor.${q("id")})))`,
      );
      args.push(after);
    }

    sqlParts.push(`ORDER BY c.${q("created_at")} ${dir}, c.${q("id")} ${dir}`);

    const limitVal = Number(limit);
    if (!isNaN(limitVal)) {
      if (limitAsLiteral) {
        sqlParts.push(`LIMIT ${limitVal}`);
      } else {
        sqlParts.push(`LIMIT ${p(nextIdx++)}`);
        args.push(limitVal);
      }
    }

    const query = sqlParts.join(" ");
    const rows = await this.executor.all<Record<string, unknown>>(query, args);
    for (let i = 0; i < rows.length; i++) {
      rowMapper(rows[i]!);
    }
    return rows as unknown as ConversationEntity[];
  }

  updateConversation(
    id: string,
    metadata: ConversationMetadata,
  ): Promise<ConversationEntity | undefined> {
    const { placeholder: p, quote: q, upsertSuffix } = this.config;

    return this.executor.transaction(async (tx) => {
      // Unified approach: Fetch original created_at to verify existence and preserve it.
      // 1. Existence check: Ensure the conversation exists before updating (returning
      //    undefined if missing). This prevents clients from accidentally creating
      //    "zombie" conversations with custom IDs.
      // 2. Consistency: Standard SQL (Postgres/MySQL/SQLite) preserves the original
      //    creation timestamp.
      // 3. Deduplication: GreptimeDB requires the EXACT same Time Index (created_at)
      //    to deduplicate the row.
      const conversation = await this.getConversationInternal(id, tx);

      if (!conversation) return;
      const createdAt = conversation.created_at;

      const pk = ["id"];
      const updateCols = ["metadata"];
      const suffix = upsertSuffix?.(q, pk, updateCols) ?? "";

      await tx.run(
        `INSERT INTO ${q("conversations")} (${q("id")}, ${q("metadata")}, ${q("created_at")}) ` +
          `VALUES (${p(0)}, ${p(1)}, ${p(2)}) ${suffix}`,
        [id, metadata ?? null, new Date(createdAt)],
      );

      return {
        id,
        created_at: createdAt,
        metadata: metadata ?? null,
      };
    });
  }

  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    const { placeholder: p, quote: q } = this.config;

    const { changes } = await this.executor.run(
      `DELETE FROM ${q("conversations")} WHERE ${q("id")} = ${p(0)}`,
      [id],
    );

    return { id, deleted: changes > 0 };
  }

  addItems(
    conversationId: string,
    items: ConversationItemInput[],
  ): Promise<ConversationItemEntity[] | undefined> {
    return this.addItemsInternal(conversationId, items, false);
  }

  private addItemsInternal(
    conversationId: string,
    items: ConversationItemInput[],
    skipCheck = false,
    executor: QueryExecutor = this.executor,
  ): Promise<ConversationItemEntity[] | undefined> {
    return executor.transaction(async (tx) => {
      if (!skipCheck) {
        const conversation = await this.getConversationInternal(conversationId, tx);
        if (!conversation) return;
      }

      const { placeholder: p, quote: q } = this.config;
      const columns = ["id", "conversation_id", "type", "data", "created_at"];

      const placeholders = columns.map((_, i) => p(i)).join(", ");
      const sql = `INSERT INTO ${q("conversation_items")} (${columns
        .map((c) => q(c))
        .join(", ")}) VALUES (${placeholders})`;

      const now = Date.now();
      const results: ConversationItemEntity[] = [];

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

      return results;
    });
  }

  async getItem(
    conversationId: string,
    itemId: string,
  ): Promise<ConversationItemEntity | undefined> {
    const { placeholder: p, quote: q, selectJson: sj } = this.config;
    const row = await this.executor.get<Record<string, unknown>>(
      `SELECT ${q("id")}, ${q("conversation_id")}, ${q("created_at")}, ${q("type")}, ${sj(
        q("data"),
      )} as ${q("data")} FROM ${q("conversation_items")} WHERE ${q("id")} = ${p(0)} AND ${q(
        "conversation_id",
      )} = ${p(1)}`,
      [itemId, conversationId],
    );
    return row ? (rowMapper(row) as ConversationItemEntity) : undefined;
  }

  deleteItem(conversationId: string, itemId: string): Promise<ConversationEntity | undefined> {
    const { placeholder: p, quote: q } = this.config;

    return this.executor.transaction(async (tx) => {
      await tx.run(
        `DELETE FROM ${q("conversation_items")} WHERE ${q("id")} = ${p(0)} AND ${q(
          "conversation_id",
        )} = ${p(1)}`,
        [itemId, conversationId],
      );
      return this.getConversationInternal(conversationId, tx);
    });
  }

  async listItems(
    conversationId: string,
    params: ConversationQueryOptions,
  ): Promise<ConversationItemEntity[] | undefined> {
    const conversation = await this.getConversationInternal(conversationId, this.executor);
    if (!conversation) return undefined;

    const { after, order, limit } = params;
    const { placeholder: p, quote: q, selectJson: sj, limitAsLiteral } = this.config;

    const isAsc = order === "asc";
    const op = isAsc ? ">" : "<";
    const dir = isAsc ? "ASC" : "DESC";

    const sqlParts = [
      `SELECT c.${q("id")}, c.${q("conversation_id")}, c.${q("created_at")}, c.${q(
        "type",
      )}, ${sj(`c.${q("data")}`)} as ${q("data")} FROM ${q("conversation_items")} c WHERE c.${q(
        "conversation_id",
      )} = ${p(0)}`,
    ];
    const args: unknown[] = [conversationId];
    let nextIdx = 1;

    if (after) {
      sqlParts.push(
        `AND EXISTS (SELECT 1 FROM ${q("conversation_items")} _cursor WHERE _cursor.${q(
          "id",
        )} = ${p(nextIdx++)} AND _cursor.${q("conversation_id")} = ${p(
          nextIdx++,
        )} AND (c.${q("created_at")} ${op} _cursor.${q("created_at")} OR (c.${q(
          "created_at",
        )} = _cursor.${q("created_at")} AND c.${q("id")} ${op} _cursor.${q("id")})))`,
      );
      args.push(after, conversationId);
    }

    sqlParts.push(`ORDER BY c.${q("created_at")} ${dir}, c.${q("id")} ${dir}`);

    const limitVal = Number(limit);
    if (!isNaN(limitVal)) {
      if (limitAsLiteral) {
        sqlParts.push(`LIMIT ${limitVal}`);
      } else {
        sqlParts.push(`LIMIT ${p(nextIdx++)}`);
        args.push(limitVal);
      }
    }

    const query = sqlParts.join(" ");
    const rows = await this.executor.all<Record<string, unknown>>(query, args);
    for (let i = 0; i < rows.length; i++) {
      rowMapper(rows[i]!);
    }
    return rows as unknown as ConversationItemEntity[];
  }
}

export * from "./dialects/greptime";
export * from "./dialects/mysql";
export * from "./dialects/postgres";
export * from "./dialects/sqlite";
export * from "./dialects/types";
