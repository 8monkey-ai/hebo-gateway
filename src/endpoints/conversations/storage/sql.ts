import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type {
  ConversationStorage,
  ConversationMetadata,
  ConversationItemInput,
  ConversationQueryOptions,
  TableSchema,
  StorageHook,
  StorageExtensions,
  StorageOperation,
  ConversationEntityWithExtra,
  ConversationItemEntityWithExtra,
} from "./types";
import type { SqlDialect, QueryExecutor } from "./dialects/types";

import { createRowMapper, mergeData, parseJson, toMilliseconds } from "./dialects/utils";
import { ConversationQueryBuilder, ConversationItemQueryBuilder } from "./builder";
import { runMigration } from "./migrate";

const conversationRowMapper = createRowMapper<ConversationEntityWithExtra<any>>([
  parseJson("metadata"),
  toMilliseconds("created_at"),
]);

const itemRowMapper = createRowMapper<ConversationItemEntityWithExtra<any>>([
  parseJson("data"),
  toMilliseconds("created_at"),
  mergeData("data"),
]);

export interface SqlStorageConfig<TExtra = Record<string, any>> {
  dialect: SqlDialect;
  additionalFields?: TableSchema;
  hooks?: StorageExtensions<TExtra>;
}

export class SqlStorage<TExtra = Record<string, any>> implements ConversationStorage<TExtra> {
  readonly dialect: SqlDialect;
  readonly additionalFields: TableSchema;
  private _hooks: StorageExtensions<TExtra>["query"] = {};
  private convBuilder: ConversationQueryBuilder;
  private itemBuilder: ConversationItemQueryBuilder;

  constructor(options: SqlDialect | SqlStorageConfig<TExtra>) {
    if ("executor" in options) {
      this.dialect = options;
      this.additionalFields = {};
    } else {
      this.dialect = options.dialect;
      this.additionalFields = options.additionalFields ?? {};
      this._hooks = options.hooks?.query ?? {};
    }
    this.convBuilder = new ConversationQueryBuilder(
      this.config,
      this.additionalFields.conversations,
    );
    this.itemBuilder = new ConversationItemQueryBuilder(
      this.config,
      this.additionalFields.conversation_items,
    );
  }

  private get executor() {
    return this.dialect.executor;
  }
  private get config() {
    return this.dialect.config;
  }

  // @ts-expect-error The dynamic hook typing of TExtra breaks strict class assignment to the base interface.
  $extends(extension: StorageExtensions<TExtra>): this {
    if (extension.query) {
      for (const [resource, hooks] of Object.entries(extension.query)) {
        const res = resource as keyof StorageExtensions<TExtra>["query"];
        const currentHooks = (this._hooks as Record<string, unknown>)[res] ?? {};
        (this._hooks as Record<string, unknown>)[res] = {
          ...(currentHooks as Record<string, unknown>),
          ...(hooks as Record<string, unknown>),
        };
      }
    }
    return this;
  }

  private async executeOperation<
    TResource extends keyof NonNullable<StorageExtensions<TExtra>["query"]>,
    TOperation extends keyof NonNullable<
      NonNullable<StorageExtensions<TExtra>["query"]>[TResource]
    >,
    TArgs,
    TResult,
  >(
    resource: TResource,
    operation: TOperation,
    args: TArgs,
    context: any,
    query: (args: TArgs, options?: { table?: string }) => Promise<TResult>,
  ): Promise<TResult> {
    const hooksForResource = this._hooks?.[resource] as Record<string, unknown> | undefined;
    const hook = hooksForResource?.[operation as string] as StorageHook<TArgs, TResult> | undefined;
    if (hook) {
      return hook({
        operation: operation as StorageOperation,
        args,
        context,
        table: resource,
        query: (newArgs: TArgs, options?: { table?: string }) => query(newArgs, options),
      });
    }
    return query(args, { table: resource });
  }

  async migrate() {
    await runMigration(this.executor, this.config, this.additionalFields);
  }

  async createConversation(
    params: {
      metadata?: ConversationMetadata;
      items?: ConversationItemInput[];
    } & Partial<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra>> {
    return this.executeOperation("conversations", "create", params, context, (args, options) =>
      this._createConversationImpl(args, options),
    );
  }

  private async _createConversationImpl(
    args: { metadata?: ConversationMetadata; items?: ConversationItemInput[] } & Partial<TExtra>,
    options?: { table?: string },
  ) {
    const { placeholder: p, quote: q } = this.config;
    const isGreptime = this.config.types.index === "TIME";
    const id = isGreptime ? uuidv4() : uuidv7();
    const metadata = args.metadata ?? null;
    const now = new Date();
    const table = options?.table ?? "conversations";

    const schemaFields = this.additionalFields.conversations ?? {};
    const columns = ["id", "metadata", "created_at"];
    const values = [id, metadata, now];

    for (const key of Object.keys(schemaFields)) {
      if (key in args) {
        columns.push(key);
        values.push((args as any)[key]);
      }
    }

    const placeholders = columns.map((_, i) => p(i)).join(", ");

    return this.executor.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO ${q(table)} (${columns.map((c) => q(c)).join(", ")}) ` +
          `VALUES (${placeholders})`,
        values,
      );

      const conversation = {
        id,
        created_at: now.getTime(),
        metadata,
        ...args,
      } as ConversationEntityWithExtra<TExtra>;

      if (args.items?.length) {
        await this.addItemsInternal(id, args.items, true, tx);
      }

      return conversation;
    });
  }

  getConversation(
    id: string,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation("conversations", "get", { id }, context, (args, options) => {
      const table = options?.table ?? "conversations";
      return this.getConversationInternal(args.id, this.executor, table);
    });
  }

  private async getConversationInternal(
    id: string,
    executor: QueryExecutor,
    table = "conversations",
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    const { placeholder: p, quote: q, selectJson: sj } = this.config;
    const schemaFields = this.additionalFields.conversations ?? {};
    const extraCols = Object.keys(schemaFields)
      .map((c) => q(c))
      .join(", ");
    const cols = [`${q("id")}`, `${q("created_at")}`, `${sj(q("metadata"))} as ${q("metadata")}`];
    if (extraCols) cols.push(extraCols);

    const row = await executor.get<Record<string, unknown>>(
      `SELECT ${cols.join(", ")} FROM ${q(table)} WHERE ${q("id")} = ${p(
        0,
      )} ORDER BY ${q("created_at")} DESC LIMIT 1`,
      [id],
    );
    return row ? conversationRowMapper(row) : undefined;
  }

  async listConversations(
    params: ConversationQueryOptions<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra>[]> {
    return this.executeOperation(
      "conversations",
      "list",
      params,
      context,
      async (args, options) => {
        const table = options?.table ?? "conversations";
        const { sql, args: queryArgs } = this.convBuilder.buildListQuery(table, args);

        const rows = await this.executor.all<Record<string, unknown>>(sql, queryArgs);
        for (let i = 0; i < rows.length; i++) {
          conversationRowMapper(rows[i]!);
        }
        return rows as unknown as ConversationEntityWithExtra<TExtra>[];
      },
    );
  }

  updateConversation(
    id: string,
    params: { metadata?: ConversationMetadata } & Partial<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation(
      "conversations",
      "update",
      { id, params },
      context,
      (args, options) => this._updateConversationImpl(args, options),
    );
  }

  private async _updateConversationImpl(
    args: { id: string; params: { metadata?: ConversationMetadata } & Partial<TExtra> },
    options?: { table?: string },
  ) {
    const { placeholder: p, quote: q, upsertSuffix } = this.config;
    const table = options?.table ?? "conversations";

    return this.executor.transaction(async (tx) => {
      const conversation = await this.getConversationInternal(args.id, tx, table);
      if (!conversation) return;

      const createdAt = conversation.created_at;
      const meta = args.params.metadata ?? conversation.metadata;

      const schemaFields = this.additionalFields.conversations ?? {};
      const columns = ["id", "metadata", "created_at"];
      const values = [args.id, meta, new Date(createdAt)];

      for (const key of Object.keys(schemaFields)) {
        if (key in args.params) {
          columns.push(key);
          values.push((args.params as any)[key]);
        }
      }

      const pk = ["id"];
      const updateCols = columns.filter((c) => c !== "id" && c !== "created_at");
      const suffix = upsertSuffix?.(q, pk, updateCols) ?? "";
      const placeholders = columns.map((_, i) => p(i)).join(", ");

      await tx.run(
        `INSERT INTO ${q(table)} (${columns.map((c) => q(c)).join(", ")}) ` +
          `VALUES (${placeholders}) ${suffix}`,
        values,
      );

      return {
        id: args.id,
        created_at: createdAt,
        metadata: meta,
        ...args.params,
      } as ConversationEntityWithExtra<TExtra>;
    });
  }

  async deleteConversation(id: string, context?: any): Promise<{ id: string; deleted: boolean }> {
    return this.executeOperation(
      "conversations",
      "delete",
      { id },
      context,
      async (args, options) => {
        const { placeholder: p, quote: q } = this.config;
        const table = options?.table ?? "conversations";

        const { changes } = await this.executor.run(
          `DELETE FROM ${q(table)} WHERE ${q("id")} = ${p(0)}`,
          [args.id],
        );

        return { id: args.id, deleted: changes > 0 };
      },
    );
  }

  addItems(
    conversationId: string,
    items: ConversationItemInput[],
    context?: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined> {
    return this.executeOperation(
      "conversation_items",
      "create",
      { conversationId, items },
      context,
      async (args) => {
        return this.addItemsInternal(args.conversationId, args.items, false);
      },
    );
  }

  private addItemsInternal(
    conversationId: string,
    items: ConversationItemInput[],
    skipCheck = false,
    executor: QueryExecutor = this.executor,
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined> {
    return executor.transaction(async (tx) => {
      if (!skipCheck) {
        const conversation = await this.getConversationInternal(conversationId, tx);
        if (!conversation) return;
      }

      const { placeholder: p, quote: q } = this.config;
      const schemaFields = this.additionalFields.conversation_items ?? {};
      const baseColumns = ["id", "conversation_id", "type", "data", "created_at"];

      const now = Date.now();
      const results: ConversationItemEntityWithExtra<TExtra>[] = [];

      let offset = 0;
      for (const input of items) {
        const { id: inputId, type } = input;
        const id = inputId ?? uuidv7();
        const createdAt = new Date(now + offset++);

        const columns = [...baseColumns];
        const values = [id, conversationId, type, input, createdAt];

        for (const key of Object.keys(schemaFields)) {
          if (key in input) {
            columns.push(key);
            values.push((input as any)[key]);
          }
        }

        const placeholders = columns.map((_, i) => p(i)).join(", ");
        const sql = `INSERT INTO ${q("conversation_items")} (${columns
          .map((c) => q(c))
          .join(", ")}) VALUES (${placeholders})`;

        await tx.run(sql, values);

        const item = {
          ...input,
          id,
          conversation_id: conversationId,
          created_at: createdAt.getTime(),
        } as ConversationItemEntityWithExtra<TExtra>;

        results.push(item);
      }

      return results;
    });
  }

  async getItem(
    conversationId: string,
    itemId: string,
    context?: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation(
      "conversation_items",
      "get",
      { conversationId, itemId },
      context,
      async (args, options) => {
        const { placeholder: p, quote: q, selectJson: sj } = this.config;
        const table = options?.table ?? "conversation_items";
        const schemaFields = this.additionalFields.conversation_items ?? {};
        const extraCols = Object.keys(schemaFields)
          .map((c) => q(c))
          .join(", ");

        const cols = [
          q("id"),
          q("conversation_id"),
          q("created_at"),
          q("type"),
          `${sj(q("data"))} as ${q("data")}`,
        ];
        if (extraCols) cols.push(extraCols);

        const row = await this.executor.get<Record<string, unknown>>(
          `SELECT ${cols.join(", ")} FROM ${q(table)} WHERE ${q("id")} = ${p(0)} AND ${q(
            "conversation_id",
          )} = ${p(1)}`,
          [args.itemId, args.conversationId],
        );
        return row ? itemRowMapper(row) : undefined;
      },
    );
  }

  deleteItem(
    conversationId: string,
    itemId: string,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation(
      "conversation_items",
      "delete",
      { conversationId, itemId },
      context,
      async (args, options) => {
        const { placeholder: p, quote: q } = this.config;
        const table = options?.table ?? "conversation_items";

        return this.executor.transaction(async (tx) => {
          await tx.run(
            `DELETE FROM ${q(table)} WHERE ${q("id")} = ${p(0)} AND ${q(
              "conversation_id",
            )} = ${p(1)}`,
            [args.itemId, args.conversationId],
          );
          return this.getConversationInternal(args.conversationId, tx);
        });
      },
    );
  }

  async listItems(
    conversationId: string,
    params: ConversationQueryOptions<TExtra>,
    context?: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined> {
    return this.executeOperation(
      "conversation_items",
      "list",
      { conversationId, ...params },
      context,
      async (args, options) => {
        const conversation = await this.getConversationInternal(args.conversationId, this.executor);
        if (!conversation) return;

        const table = options?.table ?? "conversation_items";
        const { sql, args: queryArgs } = this.itemBuilder.buildListQuery(
          table,
          args.conversationId,
          args,
        );

        const rows = await this.executor.all<Record<string, unknown>>(sql, queryArgs);
        for (let i = 0; i < rows.length; i++) {
          itemRowMapper(rows[i]!);
        }
        return rows as unknown as ConversationItemEntityWithExtra<TExtra>[];
      },
    );
  }
}

export * from "./dialects/greptime";
export * from "./dialects/mysql";
export * from "./dialects/postgres";
export * from "./dialects/sqlite";
export * from "./dialects/types";
