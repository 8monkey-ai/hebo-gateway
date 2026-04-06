import type {
  Storage,
  StorageOperation,
  StorageExtension,
  StorageQueryOptions,
  DatabaseSchema,
  RowMapper,
  ColumnSchema,
  SortOrder,
  TableClient,
  StorageExtensionCallback,
} from "./types";
import { type QueryExecutor, type SqlConfig } from "./dialects/types";

export class SqlStorage<TSchema extends DatabaseSchema = any, TExtra = Record<string, any>>
  implements Storage<TSchema, TExtra>
{
  [tableName: string]: any;

  private readonly executor: QueryExecutor;
  private readonly config: SqlConfig;
  private readonly extensions: StorageExtension<TSchema>[] = [];
  private schema: DatabaseSchema = {};

  constructor(params: { dialect: { executor: QueryExecutor; config: SqlConfig } }) {
    this.executor = params.dialect.executor;
    this.config = params.dialect.config;

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target) && !prop.startsWith("$") && !prop.startsWith("_")) {
          return target.createTableClient(prop);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  private createTableClient(tableName: string): TableClient<any, TExtra> {
    return {
      findMany: (options, context, mapper, tx) =>
        this.executeWithExtensions(tableName, "findMany", options, context, (args) =>
          this._findMany(tableName, args, context, mapper, tableName, tx),
        ),
      findFirst: (criteria, context, mapper, options, tx) =>
        this.executeWithExtensions(tableName, "findFirst", criteria, context, (args) =>
          this._findFirst(tableName, args, context, mapper, options, tableName, tx),
        ),
      create: (data, context, tx) =>
        this.executeWithExtensions(tableName, "create", data, context, (args) =>
          this._create(tableName, args, context, tableName, tx),
        ),
      update: (id, data, context, tx) =>
        this.executeWithExtensions(tableName, "update", { id, data }, context, (args) =>
          this._update(tableName, args.id, args.data, context, tableName, tx),
        ),
      delete: (criteria, context, tx) =>
        this.executeWithExtensions(tableName, "delete", criteria, context, (args) =>
          this._delete(tableName, args, context, tableName, tx),
        ),
    };
  }

  $extends(extension: StorageExtension<TSchema>): this {
    this.extensions.push(extension);
    return this;
  }

  private async executeWithExtensions<TArgs, TResult>(
    model: string,
    operation: StorageOperation,
    args: TArgs,
    context: any,
    baseOperation: (args: TArgs) => Promise<TResult>,
  ): Promise<TResult> {
    const relevantExtensions: StorageExtensionCallback[] = [];

    // Build the chain of extensions
    for (const ext of this.extensions) {
      if (!ext.query) continue;

      // 1. Specific model, specific operation
      const modelExt = ext.query[model as keyof TSchema];
      if (modelExt) {
        const opExt = (modelExt as any)[operation] || (modelExt as any)["$allOperations"];
        if (opExt) relevantExtensions.push(opExt);
      }

      // 2. $allModels
      const allModelsExt = ext.query["$allModels"];
      if (allModelsExt) {
        const opExt = (allModelsExt as any)[operation] || (allModelsExt as any)["$allOperations"];
        if (opExt) relevantExtensions.push(opExt);
      }
    }

    // Execute the chain from right to left (last extension is the outermost wrapper)
    const executeChain = async (index: number, currentArgs: TArgs): Promise<TResult> => {
      if (index < 0) {
        return baseOperation(currentArgs);
      }

      const callback = relevantExtensions[index];
      return callback({
        model,
        operation,
        args: currentArgs,
        context,
        query: (nextArgs: any) => executeChain(index - 1, nextArgs),
      });
    };

    return executeChain(relevantExtensions.length - 1, args);
  }

  // ==========================================================================
  // --- Generic Core Operations ---
  // ==========================================================================

  async _findMany<T>(
    resource: string,
    options: StorageQueryOptions,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<T[]> {
    const { sql, args: queryArgs } = this.buildListQuery(resource, table, options);
    const rows = await tx.all<Record<string, unknown>>(sql, queryArgs);
    return rows.map(mapper);
  }

  async _findFirst<T>(
    resource: string,
    criteria: Record<string, unknown>,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    options: { orderBy?: Record<string, SortOrder> } = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<T | undefined> {
    const { sql, args: queryArgs } = this.buildGetQuery(table, resource, criteria, options);
    const row = await tx.get<Record<string, unknown>>(sql, queryArgs);
    return row ? mapper(row) : undefined;
  }

  async _create(
    resource: string,
    data: Record<string, unknown>,
    context: any = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<{ changes: number }> {
    const { sql, args: queryArgs } = this.buildInsertQuery(table, resource, data);
    const { changes } = await tx.run(sql, queryArgs);
    return { changes };
  }

  async _update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    context: any = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<{ changes: number }> {
    const { sql, args: queryArgs } = this.buildUpdateQuery(resource, table, id, data);
    const { changes } = await tx.run(sql, queryArgs);
    return { changes };
  }

  async _delete(
    resource: string,
    criteria: Record<string, unknown>,
    context: any = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<{ changes: number }> {
    const { sql, args: queryArgs } = this.buildDeleteQuery(table, criteria);
    const { changes } = await tx.run(sql, queryArgs);
    return { changes };
  }

  async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return this.executor.transaction(fn);
  }

  // ==========================================================================
  // --- Migration ---
  // ==========================================================================

  async migrate(
    schema: TSchema,
    additionalFields: Record<string, Record<string, { type: string }>> = {},
  ) {
    this.schema = { ...this.schema, ...schema };
    const { types, quote: q, supportCreateIndexIfNotExists } = this.config;
    const isTimeIndex = types.index === "TIME";

    const varchar = (len: number) => (types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`);
    const timeIndex = (hasCreatedAt: boolean) =>
      isTimeIndex && hasCreatedAt ? `, TIME INDEX (${q("created_at")})` : "";
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

    for (const [tableName, columns] of Object.entries(schema)) {
      const allColumns = { ...columns, ...additionalFields[tableName] };

      const columnDefs = Object.entries(allColumns)
        .map(([name, col]) => {
          if (name.startsWith("$")) return null;
          const column = col as ColumnSchema;
          let type = column.type;
          if (type === "VARCHAR(255)") type = varchar(255);
          if (type === "VARCHAR(64)") type = varchar(64);
          if (type === "TIMESTAMP") type = types.timestamp;
          if (type === "JSON") type = types.json;

          let extra = "";
          if (isTimeIndex && column.skippingIndex) {
            extra = " SKIPPING INDEX";
          }

          return `${q(name)} ${type}${extra}`;
        })
        .filter(Boolean);

      const hasCreatedAt = allColumns.created_at !== undefined;
      const primaryKeyCols = (columns as any).$primaryKey ?? ["id"];
      const pk = `PRIMARY KEY (${primaryKeyCols.map((c: string) => q(c)).join(", ")})`;

      let part = "";
      const partitionCols = (columns as any).$partitionBy;
      if (partitionCols?.length) {
        part = partition(partitionCols);
      }

      await this.executor.run(
        `CREATE TABLE IF NOT EXISTS ${q(tableName)} (${columnDefs.join(", ")}, ${pk}${timeIndex(hasCreatedAt)})${part}${withClause}`,
      );

      if (!isTimeIndex) {
        const indexes = (columns as any).$indexes as string[][] | undefined;
        if (indexes?.length) {
          let idxCount = 1;
          for (const idxCols of indexes) {
            const idxName = `${tableName}_idx_${idxCount++}`;
            await createIndex(tableName, idxName, idxCols, true);
          }
        } else if (hasCreatedAt) {
          // Fallback legacy behavior
          const idxName = `${tableName}_created_at_idx`;
          await createIndex(tableName, idxName, ["created_at"]);
        }
      }
    }
  }

  // ==========================================================================
  // --- Query Builders (Internal) ---
  // ==========================================================================

  private buildListQuery(resource: string, table: string, options: StorageQueryOptions) {
    const { quote: q, placeholder, limitAsLiteral } = this.config;
    let sql = `SELECT * FROM ${q(table)}`;
    const args: any[] = [];
    let nextIdx = 1;

    const conditions: string[] = ["1=1"];

    if (options.where) {
      const { sql: whereSql, args: whereArgs } = this.buildWhereClause(
        resource,
        options.where,
        nextIdx,
      );
      conditions.push(whereSql);
      args.push(...whereArgs);
      nextIdx += whereArgs.length;
    }

    if (options.after) {
      const subqueryArgs: any[] = [];
      let subIdx = nextIdx;

      let subWhere = `${q("id")} = ${placeholder(subIdx++)}`;
      subqueryArgs.push(options.after);

      // If this list query is heavily filtered (e.g. by conversation_id),
      // we must include those same critical equality filters in the cursor lookup
      // to hit the right composite index and row.
      if (options.where) {
        for (const [key, val] of Object.entries(options.where)) {
          if (!key.includes(".") && !key.includes(" ") && typeof val !== "object" && val !== null) {
            subWhere += ` AND ${q(key)} = ${placeholder(subIdx++)}`;
            subqueryArgs.push(val);
          }
        }
      }

      // RATIONALE: Why is `after` a dedicated parameter instead of a generic `where` condition?
      // Cursor pagination requires complex tie-breaker logic. If multiple rows share the exact
      // same sort value (e.g., identical timestamps), a simple `where: { created_at < cursor }`
      // will skip the tied rows.
      //
      // By keeping `after` as a dedicated feature, the storage engine handles two major complexities:
      // 1. N+1 Performance: It automatically generates an `EXISTS` subquery to fetch the cursor's
      //    timestamp/value dynamically inside the database, saving a full database round-trip.
      // 2. Query AST Complexity: It automatically builds the deterministic tie-breaker offset
      //    (Condition A OR Condition B) without pushing complex `$or` AST generation into the domain layer.
      //
      // NOTE: This generic implementation currently only supports cursor pagination based on
      // a single primary sort column (extracted from `orderBy`). If multiple sorting fields
      // are provided (e.g. "score desc, name asc"), only the first field is used for the cursor
      // offset. The `id` column is always appended as the final deterministic tie-breaker.
      if (options.orderBy && Object.keys(options.orderBy).length > 0) {
        const [sortCol, dir] = Object.entries(options.orderBy)[0];
        const isAsc = dir.toLowerCase() === "asc";
        const op = isAsc ? ">" : "<";

        // FUTURE: Use full $primaryKey array as the deterministic tie-breaker for stable cursors.
        conditions.push(
          `EXISTS (SELECT 1 FROM ${q(table)} _cursor WHERE ${subWhere} AND (${q(table)}.${q(sortCol)} ${op} _cursor.${q(sortCol)} OR (${q(table)}.${q(sortCol)} = _cursor.${q(sortCol)} AND ${q(table)}.${q("id")} ${op} _cursor.${q("id")})))`,
        );
      } else {
        // FUTURE: Use full $primaryKey array as the deterministic tie-breaker for stable cursors.
        conditions.push(
          `EXISTS (SELECT 1 FROM ${q(table)} _cursor WHERE ${subWhere} AND ${q(table)}.${q("id")} > _cursor.${q("id")})`,
        );
      }

      args.push(...subqueryArgs);
      nextIdx = subIdx;
    }

    sql += ` WHERE ${conditions.join(" AND ")}`;

    if (options.orderBy && Object.keys(options.orderBy).length > 0) {
      const orderClauses = Object.entries(options.orderBy).map(([col, dir]) => {
        return `${q(col)} ${dir.toUpperCase()}`;
      });
      // Append ID as a deterministic tie-breaker
      // FUTURE: Use full $primaryKey array as the deterministic tie-breaker for stable cursors.
      const primaryDir = Object.values(options.orderBy)[0].toUpperCase();
      sql += ` ORDER BY ${orderClauses.join(", ")}, ${q("id")} ${primaryDir}`;
    }

    if (options.limit !== undefined) {
      const limitVal = Number(options.limit);
      if (!isNaN(limitVal)) {
        if (limitAsLiteral) {
          sql += ` LIMIT ${limitVal}`;
        } else {
          sql += ` LIMIT ${placeholder(nextIdx++)}`;
          args.push(limitVal);
        }
      }
    }

    return { sql, args };
  }

  private buildGetQuery(
    table: string,
    resource: string,
    criteria: Record<string, unknown>,
    options: { orderBy?: Record<string, SortOrder> } = {},
  ) {
    const { quote: q } = this.config;
    let sql = `SELECT * FROM ${q(table)}`;
    const args: any[] = [];

    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(resource, criteria, 1);
    sql += ` WHERE ${whereSql}`;
    args.push(...whereArgs);

    if (options.orderBy && Object.keys(options.orderBy).length > 0) {
      const orderClauses = Object.entries(options.orderBy).map(([col, dir]) => {
        return `${q(col)} ${dir.toUpperCase()}`;
      });
      sql += ` ORDER BY ${orderClauses.join(", ")}`;
    }

    sql += ` LIMIT 1`;

    return { sql, args };
  }

  private buildInsertQuery(table: string, resource: string, data: Record<string, unknown>) {
    const { quote: q, placeholder } = this.config;
    const keys = Object.keys(data);
    const cols = keys.map((k) => q(k)).join(", ");
    const vals = keys.map((_, i) => placeholder(i + 1)).join(", ");

    const sql = `INSERT INTO ${q(table)} (${cols}) VALUES (${vals})`;
    const args = keys.map((k) => data[k]);

    return { sql, args };
  }

  private buildUpdateQuery(
    resource: string,
    table: string,
    id: string,
    data: Record<string, unknown>,
  ) {
    const { quote: q, placeholder, upsertSuffix } = this.config;
    const primaryKeyCols = (this.schema[resource] as any)?.$primaryKey ?? ["id"];

    const allData = { ...data, id };
    const allKeys = Object.keys(allData);
    const cols = allKeys.map((k) => q(k)).join(", ");
    const vals = allKeys.map((_, i) => placeholder(i + 1)).join(", ");

    const updateCols = Object.keys(data).filter((k) => !primaryKeyCols.includes(k));
    const suffix = upsertSuffix?.(q, primaryKeyCols, updateCols) ?? "";

    const sql = `INSERT INTO ${q(table)} (${cols}) VALUES (${vals}) ${suffix}`;
    const args = allKeys.map((k) => allData[k]);
    return { sql, args };
  }

  private buildDeleteQuery(table: string, criteria: Record<string, unknown>) {
    const { quote: q } = this.config;
    let sql = `DELETE FROM ${q(table)}`;
    const args: any[] = [];

    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(table, criteria, 1);
    sql += ` WHERE ${whereSql}`;
    args.push(...whereArgs);

    return { sql, args };
  }

  private buildWhereClause(resource: string, where: Record<string, any>, startIdx: number) {
    const { quote: q, placeholder, jsonExtract } = this.config;
    const conditions: string[] = [];
    const args: any[] = [];
    let currentIdx = startIdx;

    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;

      if (key.includes(".")) {
        const parts = key.split(".");
        const column = parts[0];
        const path = parts.slice(1).join(".");
        conditions.push(`${jsonExtract(q(column), path)} = ${placeholder(currentIdx++)}`);
        args.push(String(value));
      } else if (key === "id" && Array.isArray(value)) {
        const placeholders = value.map(() => placeholder(currentIdx++)).join(", ");
        conditions.push(`${q(key)} IN (${placeholders})`);
        args.push(...value);
      } else if (value === null) {
        conditions.push(`${q(key)} IS NULL`);
      } else {
        if (key.includes(" ")) {
          const parts = key.split(" ");
          const field = parts[0];
          const operator = parts[1];
          conditions.push(`${q(field)} ${operator} ${placeholder(currentIdx++)}`);
        } else {
          conditions.push(`${q(key)} = ${placeholder(currentIdx++)}`);
        }
        args.push(value);
      }
    }

    return {
      sql: conditions.length > 0 ? conditions.join(" AND ") : "1=1",
      args,
    };
  }
}
