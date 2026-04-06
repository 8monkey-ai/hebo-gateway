import type {
  Storage,
  StorageOperation,
  StorageHook,
  StorageQueryOptions,
  TableSchema,
  RowMapper,
  StorageExtensions,
  ColumnSchema,
} from "./types";
import { type QueryExecutor, type SqlConfig } from "./dialects/types";

export class SqlStorage<TExtra = Record<string, any>> implements Storage<TExtra> {
  private readonly executor: QueryExecutor;
  private readonly config: SqlConfig;
  private readonly hooks: Map<string, Record<string, StorageHook<any, any>>> = new Map();
  private schema: TableSchema = {};

  constructor(params: { dialect: { executor: QueryExecutor; config: SqlConfig } }) {
    this.executor = params.dialect.executor;
    this.config = params.dialect.config;
  }

  $extends(extension: StorageExtensions): this {
    if (extension.hooks) {
      for (const [resource, resourceHooks] of Object.entries(extension.hooks)) {
        const existing = this.hooks.get(resource) ?? {};
        this.hooks.set(resource, { ...existing, ...resourceHooks });
      }
    }
    return this;
  }

  private async executeOperation<TArgs, TResult>(
    resource: string,
    operation: StorageOperation,
    args: TArgs,
    context: any,
    tx: QueryExecutor,
    query: (args: TArgs, options?: { table?: string; tx?: QueryExecutor }) => Promise<TResult>,
  ): Promise<TResult> {
    const hook = this.hooks.get(resource)?.[operation];
    if (hook) {
      return hook({
        operation,
        args,
        context,
        table: resource,
        query: (newArgs: TArgs, options?: { table?: string; tx?: QueryExecutor }) => query(newArgs, { tx, ...options }),
      });
    }

    return query(args, { tx });
  }

  // ==========================================================================
  // --- Generic Core Operations ---
  // ==========================================================================

  async find<T>(
    resource: string,
    options: StorageQueryOptions,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<T[]> {
    return this.executeOperation(resource, "list", options, context, tx, async (args, op) => {
      const { sql, args: queryArgs } = this.buildListQuery(resource, op?.table ?? table, args);
      const rows = await (op?.tx ?? tx).all<Record<string, unknown>>(sql, queryArgs);
      return rows.map(mapper);
    });
  }

  async findOne<T>(
    resource: string,
    criteria: Record<string, unknown>,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    options: { orderBy?: string } = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<T | undefined> {
    return this.executeOperation(resource, "get", criteria, context, tx, async (args, op) => {
      const { sql, args: queryArgs } = this.buildGetQuery(op?.table ?? table, resource, args, options);
      const row = await (op?.tx ?? tx).get<Record<string, unknown>>(sql, queryArgs);
      return row ? mapper(row) : undefined;
    });
  }

  async insert(resource: string, data: Record<string, unknown>, context: any = {}, table: string = resource, tx: QueryExecutor = this.executor): Promise<{ changes: number }> {
    return this.executeOperation(resource, "create", data, context, tx, async (args, op) => {
      const { sql, args: queryArgs } = this.buildInsertQuery(op?.table ?? table, resource, args);
      const { changes } = await (op?.tx ?? tx).run(sql, queryArgs);
      return { changes };
    });
  }

  async update(resource: string, id: string, data: Record<string, unknown>, context: any = {}, table: string = resource, tx: QueryExecutor = this.executor): Promise<{ changes: number }> {
    return this.executeOperation(resource, "update", { id, data }, context, tx, async (args, op) => {
      const { sql, args: queryArgs } = this.buildUpdateQuery(resource, op?.table ?? table, args.id, args.data);
      const { changes } = await (op?.tx ?? tx).run(sql, queryArgs);
      return { changes };
    });
  }

  async remove(resource: string, criteria: Record<string, unknown>, context: any = {}, table: string = resource, tx: QueryExecutor = this.executor): Promise<{ changes: number }> {
    return this.executeOperation(resource, "delete", criteria, context, tx, async (args, op) => {
      const { sql, args: queryArgs } = this.buildDeleteQuery(op?.table ?? table, args);
      const { changes } = await (op?.tx ?? tx).run(sql, queryArgs);
      return { changes };
    });
  }

  async transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return this.executor.transaction(fn);
  }

  // ==========================================================================
  // --- Migration ---
  // ==========================================================================

  async migrate(schema: TableSchema, additionalFields: Record<string, Record<string, { type: string }>> = {}) {
    this.schema = { ...this.schema, ...schema };
    const { types, quote: q, supportCreateIndexIfNotExists } = this.config;
    const isTimeIndex = types.index === "TIME";

    const varchar = (len: number) => (types.varchar === "TEXT" ? "TEXT" : `${types.varchar}(${len})`);
    const timeIndex = (hasCreatedAt: boolean) => isTimeIndex && hasCreatedAt ? `, TIME INDEX (${q("created_at")})` : "";
    const withClause = isTimeIndex ? ` WITH ('merge_mode'='last_non_null')` : "";
    const partition = (cols: string[]) =>
      this.config.partitionClause ? ` ${this.config.partitionClause(cols.map((col) => q(col)))}` : "";

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
          `CREATE INDEX ${ifNotExists} ${q(name)} ON ${q(table)} ${using} (${formattedCols})`
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
      
      const columnDefs = Object.entries(allColumns).map(([name, col]) => {
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
      }).filter(Boolean);

      const hasCreatedAt = allColumns.created_at !== undefined;
      const primaryKeyCols = (columns as any).$primaryKey ?? ["id"];
      const pk = `PRIMARY KEY (${primaryKeyCols.map((c: string) => q(c)).join(", ")})`;
      
      let part = "";
      const partitionCols = (columns as any).$partitionBy;
      if (partitionCols?.length) {
        part = partition(partitionCols);
      }

      await this.executor.run(
        `CREATE TABLE IF NOT EXISTS ${q(tableName)} (${columnDefs.join(", ")}, ${pk}${timeIndex(hasCreatedAt)})${part}${withClause}`
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
      const { sql: whereSql, args: whereArgs } = this.buildWhereClause(resource, options.where, nextIdx);
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
      if (options.orderBy) {
        const orderSpec = options.orderBy;
        const parts = orderSpec.toLowerCase().split(" ");
        const isAsc = parts.includes("asc");
        const op = isAsc ? ">" : "<";
        const sortCol = parts[0];
        
        conditions.push(
          `EXISTS (SELECT 1 FROM ${q(table)} _cursor WHERE ${subWhere} AND (${q(table)}.${q(sortCol)} ${op} _cursor.${q(sortCol)} OR (${q(table)}.${q(sortCol)} = _cursor.${q(sortCol)} AND ${q(table)}.${q("id")} ${op} _cursor.${q("id")})))`
        );
      } else {
        conditions.push(
          `EXISTS (SELECT 1 FROM ${q(table)} _cursor WHERE ${subWhere} AND ${q(table)}.${q("id")} > _cursor.${q("id")})`
        );
      }
      
      args.push(...subqueryArgs);
      nextIdx = subIdx;
    }

    sql += ` WHERE ${conditions.join(" AND ")}`;

    if (options.orderBy) {
      const orderSpec = options.orderBy;
      const parts = orderSpec.toLowerCase().split(" ");
      const dir = parts.includes("asc") ? "ASC" : "DESC";
      const sortCol = parts[0];
      // Append ID as a deterministic tie-breaker
      sql += ` ORDER BY ${q(sortCol)} ${dir}, ${q("id")} ${dir}`;
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

  private buildGetQuery(table: string, resource: string, criteria: Record<string, unknown>, options: { orderBy?: string } = {}) {
    const { quote: q } = this.config;
    let sql = `SELECT * FROM ${q(table)}`;
    const args: any[] = [];

    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(resource, criteria, 1);
    sql += ` WHERE ${whereSql}`;
    args.push(...whereArgs);

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
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

  private buildUpdateQuery(resource: string, table: string, id: string, data: Record<string, unknown>) {
    const { quote: q, placeholder, upsertSuffix } = this.config;
    const primaryKeyCols = (this.schema[resource] as any)?.$primaryKey ?? ["id"];

    const allData = { ...data, id };
    const allKeys = Object.keys(allData);
    const cols = allKeys.map((k) => q(k)).join(", ");
    const vals = allKeys.map((_, i) => placeholder(i + 1)).join(", ");
    
    const updateCols = Object.keys(data).filter(k => !primaryKeyCols.includes(k));
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
