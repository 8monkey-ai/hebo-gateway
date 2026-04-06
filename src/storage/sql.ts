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
import { type QueryExecutor, type DialectConfig, type SqlDialect } from "./dialects/types";

export class SqlStorage<
  TSchema extends DatabaseSchema = any,
  TExtra = Record<string, any>,
> implements Storage<TSchema, TExtra> {
  [tableName: string]: any;

  readonly dialect: SqlDialect;
  private readonly executor: QueryExecutor;
  private readonly config: DialectConfig;
  private readonly extensions: StorageExtension<TSchema>[] = [];
  private schema: DatabaseSchema = {};

  constructor(params: { dialect: SqlDialect }) {
    this.dialect = params.dialect;
    this.executor = params.dialect.executor;
    this.config = params.dialect.config;

    // eslint-disable-next-line no-constructor-return, @typescript-eslint/no-unsafe-return
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop !== "string") return Reflect.get(target, prop, receiver);

        // 1. Check for table access (fluent API)
        if (!(prop in target) && !prop.startsWith("$") && !prop.startsWith("_")) {
          return target.createTableClient(prop);
        }

        // 2. Check for client-level extensions
        for (const ext of target.extensions) {
          if (ext.client && prop in ext.client) {
            return ext.client[prop].bind(target);
          }
        }

        return Reflect.get(target, prop, receiver);
      },
    }) as any;
  }

  private createTableClient(tableName: string): TableClient<any, TExtra> {
    const client: TableClient<any, TExtra> = {
      findMany: (options, context, mapper, tx) =>
        this.executeWithExtensions(tableName, "findMany", options, context, (args: any) => {
          const { table, ...queryOptions } = args;
          return this._findMany(tableName, queryOptions, context, mapper, table ?? tableName, tx);
        }),
      findFirst: (where, context, mapper, options, tx) =>
        this.executeWithExtensions(tableName, "findFirst", where, context, (args: any) => {
          const { table, ...whereArgs } = args;
          return this._findFirst(
            tableName,
            whereArgs,
            context,
            mapper,
            options,
            table ?? tableName,
            tx,
          );
        }),
      create: (data, context, tx) =>
        this.executeWithExtensions(tableName, "create", data, context, (args: any) => {
          const { table, ...dataArgs } = args;
          return this._create(tableName, dataArgs, context, table ?? tableName, tx);
        }),
      update: (id, data, context, tx) =>
        this.executeWithExtensions(tableName, "update", { id, data }, context, (args: any) => {
          const { table, ...updateArgs } = args;
          return this._update(
            tableName,
            updateArgs.id,
            updateArgs.data,
            context,
            table ?? tableName,
            tx,
          );
        }),
      delete: (where, context, tx) =>
        this.executeWithExtensions(tableName, "delete", where, context, (args: any) => {
          const { table, ...whereArgs } = args;
          return this._delete(tableName, whereArgs, context, table ?? tableName, tx);
        }),
    };

    // Apply model-level extensions
    for (const ext of this.extensions) {
      const modelMethods = ext.model?.[tableName] ?? ext.model?.["$allModels"];
      if (modelMethods) {
        for (const [name, fn] of Object.entries(modelMethods)) {
          if (!(name in client)) {
            (client as any)[name] = fn.bind(client);
          }
        }
      }
    }

    return client;
  }

  $extends(extension: StorageExtension<TSchema> | StorageExtensionFactory<TSchema>): this {
    const ext = typeof extension === "function" ? extension(this) : extension;
    this.extensions.push(ext);
    return this;
  }

  private executeWithExtensions<TArgs, TResult>(
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
        const opExt = (modelExt as any)[operation] ?? (modelExt as any)["$allOperations"];
        if (opExt) relevantExtensions.push(opExt);
      }

      // 2. $allModels
      const allModelsExt = ext.query["$allModels"];
      if (allModelsExt) {
        const opExt = (allModelsExt as any)[operation] ?? (allModelsExt as any)["$allOperations"];
        if (opExt) relevantExtensions.push(opExt);
      }
    }

    // Execute the chain from right to left (last extension is the outermost wrapper)
    const executeChain = (index: number, currentArgs: TArgs): Promise<TResult> => {
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
    return rows.map((r) => mapper(r));
  }

  async _findFirst<T>(
    resource: string,
    where: WhereCondition<TExtra>,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    options: { orderBy?: Record<string, SortOrder> } = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<T | undefined> {
    // If the input `where` object contains `where` or `orderBy` as keys (e.g. from handler/extension intercepts),
    // extract them. Otherwise, assume the entire object is the `where` condition.
    const actualWhere = (where as any).where ? (where as any).where : where;
    const actualOptions = (where as any).orderBy
      ? { ...options, orderBy: (where as any).orderBy }
      : options;

    const { sql, args: queryArgs } = this.buildGetQuery(
      table,
      resource,
      actualWhere,
      actualOptions,
    );
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
    where: WhereCondition<TExtra>,
    context: any = {},
    table: string = resource,
    tx: QueryExecutor = this.executor,
  ): Promise<{ changes: number }> {
    const { sql, args: queryArgs } = this.buildDeleteQuery(table, resource, where);
    const { changes } = await tx.run(sql, queryArgs);
    return { changes };
  }

  transaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return this.executor.transaction(fn);
  }

  // ==========================================================================
  // --- Migration ---
  // ==========================================================================

  async migrate() {
    const combinedSchema: DatabaseSchema = {};

    // 1. Collect schemas from all extensions
    for (const ext of this.extensions) {
      if (ext.schema) {
        for (const [table, tableSchema] of Object.entries(ext.schema)) {
          combinedSchema[table] = { ...combinedSchema[table], ...tableSchema };
        }
      }
    }

    this.schema = combinedSchema;
    const { types, quote: q, supportCreateIndexIfNotExists } = this.config;
    const isTimeIndex = types.index === "TIME";

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

    const tablePromises = Object.entries(this.schema).map(async ([tableName, columns]) => {
      const columnDefs = Object.entries(columns as TableSchema)
        .map(([name, col]) => {
          if (name.startsWith("$")) return null;
          const column = typeof col === "string" ? { type: col } : (col as ColumnSchema);
          const logicalType = column.type.toLowerCase();
          const type = (this.config.types as any)[logicalType] ?? column.type;

          let extra = "";
          if (isTimeIndex && column.skippingIndex) {
            extra = " SKIPPING INDEX";
          }

          return `${q(name)} ${type}${extra}`;
        })
        .filter(Boolean);

      const hasCreatedAt = (columns as TableSchema).created_at !== undefined;
      const primaryKeyCols = (columns as any).$primaryKey ?? ["id"];
      const pk = `PRIMARY KEY (${primaryKeyCols.map((c: string) => q(c)).join(", ")})`;

      let part = "";
      const partitionCols = (columns as any).$partitionBy;
      if (partitionCols?.length) {
        part = partition(partitionCols);
      }

      const createTableP = this.executor.run(
        `CREATE TABLE IF NOT EXISTS ${q(tableName)} (${columnDefs.join(", ")}, ${pk}${timeIndex(hasCreatedAt)})${part}${withClause}`,
      );

      if (isTimeIndex) {
        await createTableP;
      } else {
        await createTableP;
        const indexes = (columns as any).$indexes as string[][] | undefined;
        let indexPromises: Promise<any>[] = [];

        for (const [name, col] of Object.entries(columns as TableSchema)) {
          if (name.startsWith("$")) continue;
          const column = typeof col === "string" ? { type: col } : (col as ColumnSchema);

          if (column.index) {
            indexPromises.push(createIndex(tableName, `${tableName}_${name}_idx`, [name], false));
          }

          if (column.primaryKey && name !== "id") {
            // "id" is handled in PK natively
            indexPromises.push(createIndex(tableName, `${tableName}_${name}_pkey`, [name], false));
          }
        }

        await Promise.all(indexPromises);

        if (indexes?.length) {
          let idxCount = 1;
          await Promise.all(
            indexes.map((idxCols) => {
              const idxName = `${tableName}_idx_${idxCount++}`;
              return createIndex(tableName, idxName, idxCols, true);
            }),
          );
        } else if (hasCreatedAt) {
          // Fallback legacy behavior
          const idxName = `${tableName}_created_at_idx`;
          await createIndex(tableName, idxName, ["created_at"]);
        }
      }
    });

    await Promise.all(tablePromises);
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
    where: WhereCondition<TExtra>,
    options: { orderBy?: Record<string, SortOrder> } = {},
  ) {
    const { quote: q } = this.config;
    let sql = `SELECT * FROM ${q(table)}`;
    const args: any[] = [];

    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(resource, where, 1);
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

  private buildDeleteQuery(table: string, resource: string, where: WhereCondition<TExtra>) {
    const { quote: q } = this.config;
    let sql = `DELETE FROM ${q(table)}`;
    const args: any[] = [];

    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(table, where, 1);
    sql += ` WHERE ${whereSql}`;
    args.push(...whereArgs);

    return { sql, args };
  }

  private buildWhereClause(resource: string, where: WhereCondition<any>, startIdx: number) {
    const { quote: q, placeholder, jsonExtract } = this.config;
    const conditions: string[] = [];
    const args: any[] = [];
    let currentIdx = startIdx;

    // FUTURE: Support explicit prepared statements via .prepare() and sql.placeholder() mapping.
    const processEntry = (key: string, value: any, path: string[] = []) => {
      if (value === undefined) return;

      const isOperatorSyntax = key.includes(" ");
      const field = isOperatorSyntax ? key.split(" ")[0] : key;
      const opFromKey = isOperatorSyntax ? key.split(" ")[1] : null;

      // Handle dot-notation or nested path
      const parts = field.split(".");
      const fullPath = path.length > 0 ? [...path, ...parts] : parts;
      const column = fullPath[0];
      const jsonPath = fullPath.length > 1 ? fullPath.slice(1).join(".") : "";

      const target = jsonPath ? jsonExtract(q(column), jsonPath) : q(column);

      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const op = value;
        const opKeys = Object.keys(op);
        const isOperator = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "isNull"].some(
          (k) => k in op,
        );

        if (isOperator) {
          for (const k of opKeys) {
            if (k === "eq") {
              conditions.push(`${target} = ${placeholder(currentIdx++)}`);
              args.push(op.eq);
            } else if (k === "ne") {
              conditions.push(`${target} != ${placeholder(currentIdx++)}`);
              args.push(op.ne);
            } else if (k === "gt") {
              conditions.push(`${target} > ${placeholder(currentIdx++)}`);
              args.push(op.gt);
            } else if (k === "gte") {
              conditions.push(`${target} >= ${placeholder(currentIdx++)}`);
              args.push(op.gte);
            } else if (k === "lt") {
              conditions.push(`${target} < ${placeholder(currentIdx++)}`);
              args.push(op.lt);
            } else if (k === "lte") {
              conditions.push(`${target} <= ${placeholder(currentIdx++)}`);
              args.push(op.lte);
            } else if (k === "in") {
              const inVals = op.in as any[];
              const arr = Array.from({ length: inVals.length });
              for (let i = 0; i < inVals.length; i++) {
                arr[i] = placeholder(currentIdx++);
              }
              const inPlaceholders = arr.join(", ");
              conditions.push(`${target} IN (${inPlaceholders})`);
              args.push(...inVals);
            } else if (k === "contains") {
              conditions.push(`${target} LIKE ${placeholder(currentIdx++)}`);
              args.push(`%${op.contains}%`);
            } else if (k === "isNull") {
              conditions.push(`${target} IS ${op.isNull ? "NULL" : "NOT NULL"}`);
            }
          }
        } else {
          // Recurse into nested object
          for (const [nestedKey, nestedValue] of Object.entries(value)) {
            processEntry(nestedKey, nestedValue, fullPath);
          }
        }
      } else if (key === "id" && Array.isArray(value)) {
        // Legacy array support for ID
        const placeholders = value.map(() => placeholder(currentIdx++)).join(", ");
        conditions.push(`${q(key)} IN (${placeholders})`);
        args.push(...value);
      } else if (value === null) {
        conditions.push(`${target} IS NULL`);
      } else if (opFromKey) {
        conditions.push(`${target} ${opFromKey} ${placeholder(currentIdx++)}`);
        args.push(value);
      } else {
        conditions.push(`${target} = ${placeholder(currentIdx++)}`);
        args.push(value);
      }
    };

    for (const [key, value] of Object.entries(where)) {
      processEntry(key, value);
    }

    return {
      sql: conditions.length > 0 ? conditions.join(" AND ") : "1=1",
      args,
    };
  }
}
