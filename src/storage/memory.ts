import { v7 as uuidv7 } from "uuid";
import { LRUCache } from "lru-cache";
import type {
  StorageClient,
  StorageOperation,
  StorageQueryOptions,
  DatabaseSchema,
  WhereCondition,
  StorageExtension,
  StorageExtensionFactory,
  StorageBase,
  RowMapper,
  SortOrder,
  TableClient,
  StorageExtensionCallback,
  DatabaseClient,
} from "./types";

interface InMemoryStorageOptions {
  /**
   * Maximum size in bytes for the entire storage (if not specified in schema).
   */
  maxSize?: number;
}

/**
 * Estimates the size of a JavaScript object in bytes.
 * Maintained as per the original implementation.
 */
function estimateSize(root: unknown): number {
  let total = 0;
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const obj = stack.pop();
    if (obj === null || obj === undefined) continue;

    const t = typeof obj;
    if (t === "string") {
      total += (obj as string).length * 2;
      continue;
    }
    if (t !== "object") continue;

    if (ArrayBuffer.isView(obj)) {
      total += obj.byteLength;
      continue;
    }

    if (Array.isArray(obj)) {
      const arr = obj as unknown[];
      for (let i = 0, n = arr.length; i < n; i++) stack.push(arr[i]);
      continue;
    }

    if (obj instanceof Map) {
      for (const [k, v] of obj as Map<unknown, unknown>) {
        stack.push(k);
        stack.push(v);
      }
      continue;
    }

    const rec = obj as Record<string, unknown>;
    for (const k in rec) stack.push(rec[k]);
  }

  return total;
}

export class InMemoryStorage<
  TSchema extends DatabaseClient = DatabaseClient,
  TExtra = Record<string, unknown>,
> implements StorageBase<TSchema> {
  // Use a union type to correctly represent both possible table types.
  private readonly tables = new Map<
    string,
    Map<string, Record<string, unknown>> | LRUCache<string, Record<string, unknown>>
  >();

  // Generic Hash Indexing:
  // To avoid O(N) full table scans during find/findOne operations, we maintain in-memory hash indexes.
  // indexedColumns tracks which columns to index per table (extracted from TableSchema).
  private readonly indexedColumns = new Map<string, Set<string>>();
  // indexes is a nested map storing pointers to row IDs: Map<TableName, Map<ColumnName, Map<ColumnValue, Set<RowID>>>>
  private readonly indexes = new Map<string, Map<string, Map<unknown, Set<string>>>>();

  private readonly extensions: StorageExtension<TSchema>[] = [];
  private readonly options: InMemoryStorageOptions;
  public schema?: DatabaseSchema;
  public readonly dialect?: unknown;

  constructor(options: InMemoryStorageOptions = {}) {
    this.options = options;

    // eslint-disable-next-line no-constructor-return
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop !== "string") return Reflect.get(target, prop, receiver) as unknown;

        // 1. Check for table access (fluent API)
        if (!(prop in target) && !prop.startsWith("$") && !prop.startsWith("_")) {
          return target.createTableClient(prop);
        }

        // 2. Check for client-level extensions
        for (const ext of target.extensions) {
          if (ext.client && prop in ext.client) {
            const method = ext.client[prop];
            if (typeof method === "function") {
              return (method as (this: unknown, ...args: unknown[]) => unknown).bind(target);
            }
          }
        }

        return Reflect.get(target, prop, receiver) as unknown;
      },
    }) as unknown as InMemoryStorage<TSchema, TExtra> & TSchema;
  }

  private createTableClient(tableName: string): TableClient<unknown, TExtra> {
    const client: TableClient<unknown, TExtra> = {
      findMany: (options, context, mapper, tx) =>
        this.executeWithExtensions(tableName, "findMany", options, context, tx, (args, table, t) =>
          this._findMany(tableName, args, context, table, t, mapper),
        ),
      findFirst: (where, context, mapper, options, tx) =>
        this.executeWithExtensions(tableName, "findFirst", where, context, tx, (args, table, t) =>
          this._findFirst(tableName, args, context, table, t, mapper, options),
        ),
      create: (data, context, tx) =>
        this.executeWithExtensions(tableName, "create", data, context, tx, (args, table, t) =>
          this._create(tableName, args, context, table, t),
        ),
      update: (id, data, context, tx) =>
        this.executeWithExtensions(
          tableName,
          "update",
          { id, data },
          context,
          tx,
          (args, table, t) => this._update(tableName, args, context, table, t),
        ),
      delete: (where, context, tx) =>
        this.executeWithExtensions(tableName, "delete", where, context, tx, (args, table, t) =>
          this._delete(tableName, args, context, table, t),
        ),
    };

    // Apply model-level extensions
    for (const ext of this.extensions) {
      const modelMethods =
        ext.model?.[tableName as keyof TSchema] ??
        (ext.model?.["$allModels"] as Record<
          string,
          (this: TableClient, ...args: unknown[]) => unknown
        >);
      if (modelMethods) {
        for (const [name, fn] of Object.entries(modelMethods)) {
          if (!(name in client)) {
            (client as unknown as Record<string, unknown>)[name] = (
              fn as (this: TableClient, ...args: unknown[]) => unknown
            ).bind(client);
          }
        }
      }
    }

    return client;
  }

  $extends<TNewSchema extends DatabaseClient>(
    extension: StorageExtension<TNewSchema> | StorageExtensionFactory<TNewSchema>,
  ): StorageClient<TSchema & TNewSchema> {
    const ext =
      typeof extension === "function" ? extension(this as unknown as StorageClient) : extension;

    // Idempotency with Merging: If the extension has a name and it's already registered,
    // we merge the schema but keep the existing logic to prevent double-processing.
    const existing = ext.name ? this.extensions.find((e) => e.name === ext.name) : null;
    if (existing) {
      if (ext.schema) {
        existing.schema = { ...existing.schema, ...ext.schema };
        // Deep merge table columns if necessary
        for (const [table, tableSchema] of Object.entries(ext.schema)) {
          if (existing.schema) {
            existing.schema[table] = {
              ...(existing.schema[table] as object),
              ...(tableSchema as object),
            };
          }
        }
      }
      return this as unknown as StorageClient<TSchema & TNewSchema>;
    }

    this.extensions.push(ext as unknown as StorageExtension<TSchema>);
    return this as unknown as StorageClient<TSchema & TNewSchema>;
  }

  private executeWithExtensions<TArgs, TResult>(
    model: string,
    operation: StorageOperation,
    args: TArgs,
    context: unknown,
    tx: unknown,
    finalOp: (payload: TArgs, table: string, t: unknown) => Promise<TResult>,
  ): Promise<TResult> {
    const relevantExtensions: StorageExtensionCallback[] = [];

    // Build the chain of extensions
    for (const ext of this.extensions) {
      if (!ext.query) continue;

      // 1. Specific model, specific operation
      const modelExt =
        ext.query[model as keyof TSchema] ??
        (ext.query["$allModels" as keyof TSchema] as
          | {
              [Op in StorageOperation | "$allOperations"]?: StorageExtensionCallback;
            }
          | undefined);
      if (modelExt) {
        const opExt = modelExt[operation] ?? modelExt["$allOperations"];
        if (opExt) relevantExtensions.push(opExt);
      }
    }

    // Execute the chain from right to left (last extension is the outermost wrapper)
    const executeChain = (
      index: number,
      currentArgs: TArgs,
      currentTx?: unknown,
    ): Promise<TResult> => {
      if (index < 0) {
        const { table, ...payload } = currentArgs as unknown as {
          table?: string;
        } & TArgs;
        return finalOp(payload as unknown as TArgs, table ?? model, currentTx ?? this);
      }

      const callback = relevantExtensions[index];
      if (!callback) {
        const { table, ...payload } = currentArgs as unknown as {
          table?: string;
        } & TArgs;
        return finalOp(payload as unknown as TArgs, table ?? model, currentTx ?? this);
      }

      return callback({
        model,
        operation,
        args: currentArgs,
        context,
        tx: currentTx,
        query: (nextArgs: unknown, nextTx?: unknown) =>
          executeChain(index - 1, nextArgs as TArgs, nextTx ?? currentTx),
      }) as Promise<TResult>;
    };

    return executeChain(relevantExtensions.length - 1, args, tx);
  }

  private getTable(
    table: string,
  ): Map<string, Record<string, unknown>> | LRUCache<string, Record<string, unknown>> {
    let t = this.tables.get(table);
    if (!t) {
      // If a global maxSize was provided in constructor, use it for new tables.
      if (this.options.maxSize) {
        t = new LRUCache<string, Record<string, unknown>>({
          maxSize: this.options.maxSize,
          sizeCalculation: (value, key) => Math.max(1, estimateSize(value) + estimateSize(key)),
          dispose: (value, key) => {
            this.unindexRow(table, key, value);
          },
        });
      } else {
        t = new Map();
      }
      this.tables.set(table, t);
    }
    return t;
  }

  /**
   * Helper to add a row's ID into the hash indexes for any matching indexed columns.
   * Runs internally on `insert` and `update` operations.
   */
  private indexRow(table: string, id: string, row: Record<string, unknown>) {
    const cols = this.indexedColumns.get(table);
    if (!cols) return;
    const tableIdx = this.indexes.get(table)!;
    for (const col of cols) {
      const val = row[col];
      // Only index primitive values
      if (
        val !== null &&
        val !== undefined &&
        (typeof val === "string" || typeof val === "number" || typeof val === "boolean")
      ) {
        const valMap = tableIdx.get(col)!;
        let idSet = valMap.get(val);
        if (!idSet) {
          idSet = new Set();
          valMap.set(val, idSet);
        }
        idSet.add(id);
      }
    }
  }

  /**
   * Helper to remove a row's ID from the hash indexes.
   * Runs internally on `remove` and `update` operations, and automatically triggers when the LRUCache evicts an item.
   */
  private unindexRow(table: string, id: string, row: Record<string, unknown>) {
    const cols = this.indexedColumns.get(table);
    if (!cols) return;
    const tableIdx = this.indexes.get(table)!;
    for (const col of cols) {
      const val = row[col];
      if (
        val !== null &&
        val !== undefined &&
        (typeof val === "string" || typeof val === "number" || typeof val === "boolean")
      ) {
        const valMap = tableIdx.get(col)!;
        const idSet = valMap.get(val);
        if (idSet) {
          idSet.delete(id);
          // Clean up the Set to prevent memory leaks if it is empty
          if (idSet.size === 0) valMap.delete(val);
        }
      }
    }
  }

  /**
   * Retrieves a subset of rows from a table using available indexes to avoid O(N) full table scans.
   * If an explicit `id` is provided, it uses the primary key map O(1).
   * If an indexed column (e.g. `conversation_id`) is provided, it uses the hash index O(1).
   * If no indexed criteria are present, it falls back to returning all rows O(N).
   */
  private findIndexedRows(
    table: string,
    where?: WhereCondition<unknown>,
  ): Record<string, unknown>[] {
    const tableMap = this.getTable(table);
    if (!where) return Array.from(tableMap.values());

    // 1. Primary Key Index Check O(1)
    const whereId = (where as Record<string, unknown>)["id"];
    if (typeof whereId === "string") {
      const r = tableMap.get(whereId);
      return r ? [r] : [];
    }

    // 2. Hash Index Check O(1)
    const cols = this.indexedColumns.get(table);
    if (cols) {
      for (const col of cols) {
        const val = (where as Record<string, unknown>)[col];
        // We only index primitives (string, number, boolean) to keep memory usage low
        if (
          val !== undefined &&
          (typeof val === "string" || typeof val === "number" || typeof val === "boolean")
        ) {
          const idSet = this.indexes.get(table)?.get(col)?.get(val);
          // If we queried by an indexed column and found nothing, we know the exact result is empty
          if (!idSet) return [];

          return Array.from(idSet)
            .map((id) => tableMap.get(id))
            .filter((r): r is Record<string, unknown> => !!r);
        }
      }
    }

    // 3. Fallback: Full Table Scan O(N)
    return Array.from(tableMap.values());
  }
  migrate(): Promise<void> {
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
    for (const [table, columns] of Object.entries(combinedSchema)) {
      const limit = columns.$memoryLimit ?? this.options.maxSize;

      // 1. Automatic Index Extraction
      // Read the TableSchema to figure out which columns we should maintain Hash Indexes for.
      const idxCols = new Set<string>();
      if (columns.$partitionBy) {
        columns.$partitionBy.forEach((c: unknown) => idxCols.add(c as string));
      }
      if (columns.$indexes) {
        columns.$indexes.forEach((idx: string[]) => {
          // Extract the column name (e.g. "conversation_id" from "conversation_id DESC")
          const firstCol = idx[0]?.split(" ")[0] as string;
          if (firstCol) idxCols.add(firstCol);
        });
      }
      idxCols.delete("id"); // ID is inherently indexed via the main Map

      // 2. Initialize the empty Hash Index maps for this table
      this.indexedColumns.set(table, idxCols);
      if (!this.indexes.has(table)) {
        const colMaps = new Map<string, Map<unknown, Set<string>>>();
        idxCols.forEach((c) => colMaps.set(c, new Map()));
        this.indexes.set(table, colMaps);
      }

      // 3. Initialize the table (Map or LRUCache)
      // If a limit is specified (either in schema or constructor), ensure we use an LRUCache.
      const existing = this.tables.get(table);
      const needsLRU = !!limit;
      const isLRU = existing instanceof LRUCache;

      if (needsLRU && (!isLRU || existing.maxSize !== limit)) {
        this.tables.set(
          table,
          new LRUCache<string, Record<string, unknown>>({
            maxSize: limit,
            sizeCalculation: (value, key) => Math.max(1, estimateSize(value) + estimateSize(key)),
            noDisposeOnSet: true,
            // CRITICAL: Ensure we remove evicted items from the hash indexes to prevent memory leaks
            dispose: (value, key) => {
              this.unindexRow(table, key, value);
            },
          }),
        );
      } else if (!needsLRU && !existing) {
        this.tables.set(table, new Map());
      }
    }
    return Promise.resolve();
  }

  private sortRows(rows: Record<string, unknown>[], orderBy: Record<string, SortOrder>) {
    const specs = Object.entries(orderBy);
    if (specs.length === 0) return;

    rows.sort((a, b) => {
      for (const [field, direction] of specs) {
        const isAsc = direction.toLowerCase() === "asc";
        let valA = a[field];
        let valB = b[field];

        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();

        if (valA !== valB) {
          if (valA === undefined) return isAsc ? 1 : -1;
          if (valB === undefined) return isAsc ? -1 : 1;
          if ((valA as number | string | boolean) < (valB as number | string | boolean))
            return isAsc ? -1 : 1;
          if ((valA as number | string | boolean) > (valB as number | string | boolean))
            return isAsc ? 1 : -1;
        }
      }

      // ID Tiebreaker for stable cursors
      // FUTURE: Use full $primaryKey columns as the deterministic tie-breaker for stable cursors.
      const firstSpec = specs[0];
      const primaryDir = firstSpec ? firstSpec[1].toLowerCase() : "asc";
      const isAsc = primaryDir === "asc";
      const idA = String((a["id"] as string | number | boolean) ?? "");
      const idB = String((b["id"] as string | number | boolean) ?? "");
      return isAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
    });
  }

  _findMany<T>(
    model: string,
    options: StorageQueryOptions<TExtra>,
    _context: unknown = {},
    table: string = model,
    _tx?: unknown,
    mapper: RowMapper<T> = (r) => r as T,
  ): Promise<T[]> {
    const { limit, after, where } = options;
    if (limit !== undefined && limit <= 0) return Promise.resolve([]);

    let rows = this.findIndexedRows(table, where);

    // 1. Filter remaining properties
    if (where) {
      rows = rows.filter((r) => this.matchesWhere(r, where));
    }

    // 2. Sort explicitly if orderBy is provided
    if (options.orderBy) {
      this.sortRows(rows, options.orderBy);
    }

    // RATIONALE: Why is `after` a dedicated parameter instead of a generic `where` condition?
    // Cursor pagination requires complex tie-breaker logic. If multiple rows share the exact
    // same sort value (e.g., identical timestamps), a simple `where: { created_at < cursor }`
    // will skip the tied rows.
    //
    // By keeping `after` as a dedicated feature, the storage engine handles two major complexities:
    // 1. N+1 Performance: It automatically fetches the cursor's timestamp/value internally,
    //    saving the domain layer from having to issue a separate `findOne` query.
    // 2. Query AST Complexity: It iterates the fully sorted table to skip until the cursor
    //    is found, avoiding pushing complex `$or` AST generation into the domain layer.
    //
    // NOTE: This generic implementation currently only supports cursor pagination based on
    // a single primary sort column (extracted from `orderBy`). If multiple sorting fields
    // are provided (e.g. "score desc, name asc"), only the first field is used for the cursor
    // offset. The `id` column is always appended as the final deterministic tie-breaker.

    // 3. Cursor Pagination: after
    const out: T[] = [];
    let seen = after === null || after === undefined;
    for (const item of rows) {
      if (!seen) {
        if (item["id"] === after) seen = true;
        continue;
      }
      // Clone the item to avoid mutation bugs with mappers
      out.push(mapper({ ...item }));
      if (limit && out.length === limit) break;
    }

    return Promise.resolve(out);
  }

  _findFirst<T>(
    model: string,
    where: WhereCondition<TExtra>,
    _context: unknown = {},
    table: string = model,
    tx?: unknown,
    mapper: RowMapper<T> = (r) => r as T,
    options: { orderBy?: Record<string, SortOrder> } = {},
  ): Promise<T | undefined> {
    const actualWhere = (where as { where?: WhereCondition<unknown> }).where
      ? (where as { where: WhereCondition<unknown> }).where
      : where;
    const actualOptions = (where as { orderBy?: Record<string, SortOrder> }).orderBy
      ? { ...options, orderBy: (where as { orderBy: Record<string, SortOrder> }).orderBy }
      : options;

    const resultsPromise = this._findMany(
      model,
      { ...actualOptions, where: actualWhere, limit: 1 },
      _context,
      table,
      tx,
      mapper,
    );
    return resultsPromise.then((results) => results[0]);
  }

  _create(
    model: string,
    data: Record<string, unknown>,
    _context: unknown = {},
    table: string = model,
    _tx?: unknown,
  ): Promise<{ id: string } & Record<string, unknown>> {
    const tableMap = this.getTable(table);
    // FUTURE: Generate internal string keys from full $primaryKey columns instead of hardcoded 'id'.
    const id = (data["id"] as string) || uuidv7();
    const row = { ...data, id };
    tableMap.set(id, row);
    this.indexRow(table, id, row);
    return Promise.resolve(row);
  }

  _update(
    model: string,
    args: { id: string; data: Record<string, unknown> },
    _context: unknown = {},
    table: string = model,
    _tx?: unknown,
  ): Promise<{ changes: number }> {
    const { id, data } = args;
    const tableMap = this.getTable(table);
    const existing = tableMap.get(id);
    if (existing) {
      // FUTURE: Generate internal string keys from full $primaryKey columns instead of hardcoded 'id'.
      this.unindexRow(table, id, existing);
      const newRow = { ...existing, ...data, id };
      tableMap.set(id, newRow);
      this.indexRow(table, id, newRow);
      return Promise.resolve({ changes: 1 });
    }
    const newRow = { ...data, id };
    tableMap.set(id, newRow);
    this.indexRow(table, id, newRow);
    return Promise.resolve({ changes: 1 });
  }

  _delete(
    model: string,
    where: WhereCondition<TExtra>,
    _context: unknown = {},
    table: string = model,
    tx?: unknown,
  ): Promise<{ changes: number }> {
    return this._findMany(model, { where }, _context, table, tx, (r) => r).then((results) => {
      const tableMap = this.getTable(table);
      const toDelete = results;

      for (const row of toDelete) {
        const id = row["id"] as string;
        this.unindexRow(table, id, row);
        tableMap.delete(id);
      }

      return { changes: toDelete.length };
    });
  }

  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private matchesWhere(obj: Record<string, unknown>, where: WhereCondition<unknown>): boolean {
    for (const [key, filter] of Object.entries(where)) {
      const isOperatorSyntax = key.includes(" ");
      const fieldPath = isOperatorSyntax ? key.split(" ")[0] : key;
      const operatorFromKey = isOperatorSyntax ? key.split(" ")[1] : null;

      // FUTURE: Resolve sql.placeholder("name") values from options.params when explicit preparation is implemented.

      const value =
        fieldPath && fieldPath.includes(".")
          ? fieldPath
              .split(".")
              .reduce((o, i) => (o as Record<string, unknown>)?.[i], obj as unknown)
          : fieldPath
            ? obj[fieldPath]
            : undefined;

      if (typeof filter === "object" && filter !== null && !Array.isArray(filter)) {
        const op = filter as Record<string, unknown>;
        const isOperator = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "isNull"].some(
          (k) => k in op,
        );

        if (isOperator) {
          if ("eq" in op && value !== op["eq"]) return false;
          if ("ne" in op && value === op["ne"]) return false;
          if ("gt" in op && (value as number | string) <= (op["gt"] as number | string))
            return false;
          if ("gte" in op && (value as number | string) < (op["gte"] as number | string))
            return false;
          if ("lt" in op && (value as number | string) >= (op["lt"] as number | string))
            return false;
          if ("lte" in op && (value as number | string) > (op["lte"] as number | string))
            return false;
          if ("in" in op && !(op["in"] as unknown[]).includes(value)) return false;
          if ("contains" in op && !String(value).includes(op["contains"] as string)) return false;
          if ("isNull" in op && (op["isNull"] ? value !== null : value === null)) return false;
        } else if (typeof value === "object" && value !== null) {
          if (
            !this.matchesWhere(value as Record<string, unknown>, filter as WhereCondition<unknown>)
          )
            return false;
        } else {
          return false;
        }
      } else if (operatorFromKey) {
        if (operatorFromKey === ">" && !((value as number | string) > (filter as number | string)))
          return false;
        if (operatorFromKey === "<" && !((value as number | string) < (filter as number | string)))
          return false;
        if (
          operatorFromKey === ">=" &&
          !((value as number | string) >= (filter as number | string))
        )
          return false;
        if (
          operatorFromKey === "<=" &&
          !((value as number | string) <= (filter as number | string))
        )
          return false;
      } else if (value !== filter) {
        return false;
      }
    }
    return true;
  }
}
