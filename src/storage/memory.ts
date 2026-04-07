import { v7 as uuidv7 } from "uuid";
import { LRUCache } from "lru-cache";
import type {
  Storage,
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
      total += (obj as any).byteLength;
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
  TSchema extends DatabaseSchema = any,
  TExtra = Record<string, any>,
> implements StorageBase<TSchema, TExtra> {
  [tableName: string]: any;

  // Use a union type to correctly represent both possible table types.
  private readonly tables = new Map<string, Map<string, any> | LRUCache<string, any, any>>();

  // Generic Hash Indexing:
  // To avoid O(N) full table scans during find/findOne operations, we maintain in-memory hash indexes.
  // indexedColumns tracks which columns to index per table (extracted from TableSchema).
  private readonly indexedColumns = new Map<string, Set<string>>();
  // indexes is a nested map storing pointers to row IDs: Map<TableName, Map<ColumnName, Map<ColumnValue, Set<RowID>>>>
  private readonly indexes = new Map<string, Map<string, Map<unknown, Set<string>>>>();

  private readonly extensions: StorageExtension<TSchema>[] = [];
  private readonly options: InMemoryStorageOptions;
  public schema?: DatabaseSchema;
  public readonly dialect?: any;

  constructor(options: InMemoryStorageOptions = {}) {
    this.options = options;

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
            const method = ext.client[prop];
            if (typeof method === "function") {
              return method.bind(target);
            }
          }
        }

        return Reflect.get(target, prop, receiver);
      },
    }) as any;
  }

  private createTableClient(tableName: string): TableClient<any, TExtra> {
    const client: TableClient<any, TExtra> = {
      findMany: (options, context, mapper, tx) =>
        this.executeWithExtensions(
          tableName,
          "findMany",
          options,
          context,
          (args, t) => this._findMany(tableName, args, context, mapper, tableName, t),
          tx,
        ),
      findFirst: (where, context, mapper, options, tx) =>
        this.executeWithExtensions(
          tableName,
          "findFirst",
          where,
          context,
          (args, t) => this._findFirst(tableName, args, context, mapper, options, tableName, t),
          tx,
        ),
      create: (data, context, tx) =>
        this.executeWithExtensions(
          tableName,
          "create",
          data,
          context,
          (args, t) => this._create(tableName, args, context, tableName, t),
          tx,
        ),
      update: (id, data, context, tx) =>
        this.executeWithExtensions(
          tableName,
          "update",
          { id, data },
          context,
          (args, t) => this._update(tableName, args.id, args.data, context, tableName, t),
          tx,
        ),
      delete: (where, context, tx) =>
        this.executeWithExtensions(
          tableName,
          "delete",
          where,
          context,
          (args, t) => this._delete(tableName, args, context, tableName, t),
          tx,
        ),
    };

    // Apply model-level extensions
    for (const ext of this.extensions) {
      const modelMethods = ext.model?.[tableName] ?? ext.model?.["$allModels"];
      if (modelMethods) {
        for (const [name, fn] of Object.entries(modelMethods)) {
          // Ensure we don't accidentally overwrite built-ins like "create" unless intended.
          // In Prisma, `model` extensions are merged with the base client.
          if (!(name in client)) {
            (client as any)[name] = fn.bind(client);
          }
        }
      }
    }

    return client;
  }

  $extends(extension: StorageExtension | StorageExtensionFactory): Storage<any, TExtra> {
    const ext = typeof extension === "function" ? (extension as any)(this) : extension;

    // Idempotency with Merging: If the extension has a name and it's already registered,
    // we merge the schema but keep the existing logic to prevent double-processing.
    const existing = ext.name ? this.extensions.find((e) => e.name === ext.name) : null;
    if (existing) {
      if (ext.schema) {
        existing.schema = { ...existing.schema, ...ext.schema };
        // Deep merge table columns if necessary
        for (const [table, tableSchema] of Object.entries(ext.schema)) {
          existing.schema[table] = {
            ...(existing.schema[table] as object),
            ...(tableSchema as object),
          };
        }
      }
      return this as any;
    }

    this.extensions.push(ext);
    return this as any;
  }

  private executeWithExtensions<TArgs, TResult>(
    model: string,
    operation: StorageOperation,
    args: TArgs,
    context: any,
    baseOperation: (args: TArgs, tx?: any) => Promise<TResult>,
    tx?: any,
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
    const executeChain = (index: number, currentArgs: TArgs, currentTx?: any): Promise<TResult> => {
      if (index < 0) {
        return baseOperation(currentArgs, currentTx);
      }

      const callback = relevantExtensions[index];
      if (!callback) return baseOperation(currentArgs, currentTx);
      return callback({
        model,
        operation,
        args: currentArgs,
        context,
        tx: currentTx,
        query: (nextArgs: any, nextTx?: any) =>
          executeChain(index - 1, nextArgs, nextTx ?? currentTx),
      });
    };

    return executeChain(relevantExtensions.length - 1, args, tx);
  }

  private getTable(table: string): Map<string, any> | LRUCache<string, any, any> {
    let t = this.tables.get(table);
    if (!t) {
      // If a global maxSize was provided in constructor, use it for new tables.
      if (this.options.maxSize) {
        t = new LRUCache<string, any, any>({
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
  private indexRow(table: string, id: string, row: any) {
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
  private unindexRow(table: string, id: string, row: any) {
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
  private getCandidates(table: string, where?: WhereCondition<any>): any[] {
    const tableMap = this.getTable(table);
    if (!where) return Array.from(tableMap.values());

    // 1. Primary Key Index Check O(1)
    if (typeof where["id"] === "string") {
      const r = tableMap.get(where["id"]);
      return r ? [r] : [];
    }

    // 2. Hash Index Check O(1)
    const cols = this.indexedColumns.get(table);
    if (cols) {
      for (const col of cols) {
        const val = (where as any)[col];
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
            .filter(Boolean);
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
        columns.$partitionBy.forEach((c: any) => idxCols.add(c));
      }
      if (columns.$indexes) {
        columns.$indexes.forEach((idx: any) => {
          // Extract the column name (e.g. "conversation_id" from "conversation_id DESC")
          const firstCol = idx[0].split(" ")[0] as string;
          idxCols.add(firstCol);
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

      if (needsLRU && (!isLRU || (existing as any).maxSize !== limit)) {
        this.tables.set(
          table,
          new LRUCache<string, any, any>({
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

  private sortRows(rows: any[], orderBy: Record<string, SortOrder>) {
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
          if (valA < valB) return isAsc ? -1 : 1;
          if (valA > valB) return isAsc ? 1 : -1;
        }
      }

      // ID Tiebreaker for stable cursors
      // FUTURE: Use full $primaryKey columns as the deterministic tie-breaker for stable cursors.
      const firstSpec = specs[0];
      const primaryDir = firstSpec ? firstSpec[1].toLowerCase() : "asc";
      const isAsc = primaryDir === "asc";
      const idA = String(a.id ?? "");
      const idB = String(b.id ?? "");
      return isAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
    });
  }

  _findMany<T>(
    resource: string,
    options: StorageQueryOptions<TExtra>,
    _context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    table: string = resource,
    _tx?: any,
  ): Promise<T[]> {
    const { limit, after, where } = options;
    if (limit !== undefined && limit <= 0) return Promise.resolve([]);

    let rows = this.getCandidates(table, where);

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
        if (item.id === after) seen = true;
        continue;
      }
      // Clone the item to avoid mutation bugs with mappers
      out.push(mapper({ ...item }));
      if (limit && out.length === limit) break;
    }

    return Promise.resolve(out);
  }

  _findFirst<T>(
    resource: string,
    where: WhereCondition<TExtra>,
    _context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    options: { orderBy?: Record<string, SortOrder> } = {},
    table: string = resource,
    tx?: any,
  ): Promise<T | undefined> {
    const resultsPromise = this._findMany(
      resource,
      { ...options, where, limit: 1 },
      _context,
      mapper,
      table,
      tx,
    );
    return resultsPromise.then((results) => results[0]);
  }

  _create(
    resource: string,
    data: Record<string, unknown>,
    _context: any = {},
    table: string = resource,
    _tx?: any,
  ): Promise<any> {
    const tableMap = this.getTable(table);
    // FUTURE: Generate internal string keys from full $primaryKey columns instead of hardcoded 'id'.
    const id = (data["id"] as string) || uuidv7();
    const row = { ...data, id };
    tableMap.set(id, row);
    this.indexRow(table, id, row);
    return Promise.resolve({ changes: 1 });
  }

  _update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    _context: any = {},
    table: string = resource,
    _tx?: any,
  ): Promise<any> {
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
    resource: string,
    where: WhereCondition<TExtra>,
    _context: any = {},
    table: string = resource,
    tx?: any,
  ): Promise<any> {
    return this._findMany(resource, { where }, _context, (r) => r, table, tx).then((results) => {
      const tableMap = this.getTable(table);
      const toDelete = results as Record<string, unknown>[];

      for (const row of toDelete) {
        const id = row["id"] as string;
        this.unindexRow(table, id, row);
        tableMap.delete(id);
      }

      return { changes: toDelete.length };
    });
  }

  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private matchesWhere(obj: Record<string, unknown>, where: WhereCondition<any>): boolean {
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
        const op = filter;
        const isOperator = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "isNull"].some(
          (k) => k in op,
        );

        if (isOperator) {
          if ("eq" in op && value !== op.eq) return false;
          if ("ne" in op && value === op.ne) return false;
          if ("gt" in op && (value as any) <= op.gt) return false;
          if ("gte" in op && (value as any) < op.gte) return false;
          if ("lt" in op && (value as any) >= op.lt) return false;
          if ("lte" in op && (value as any) > op.lte) return false;
          if ("in" in op && !(op.in as any[]).includes(value)) return false;
          if ("contains" in op && !String(value).includes(op.contains as string)) return false;
          if ("isNull" in op && (op.isNull ? value !== null : value === null)) return false;
        } else if (typeof value === "object" && value !== null) {
          if (!this.matchesWhere(value as Record<string, unknown>, filter)) return false;
        } else {
          return false;
        }
      } else if (operatorFromKey) {
        if (operatorFromKey === ">" && !((value as any) > filter)) return false;
        if (operatorFromKey === "<" && !((value as any) < filter)) return false;
        if (operatorFromKey === ">=" && !((value as any) >= filter)) return false;
        if (operatorFromKey === "<=" && !((value as any) <= filter)) return false;
      } else if (value !== filter) {
        return false;
      }
    }
    return true;
  }
}
