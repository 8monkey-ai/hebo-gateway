import { LRUCache } from "lru-cache";
import type {
  Storage,
  StorageOperation,
  StorageQueryOptions,
  TableSchema,
  ResourceWhere,
  StorageExtensions,
  StorageHook,
  RowMapper,
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

export class InMemoryStorage<TExtra = Record<string, any>> implements Storage<TExtra> {
  // Use a union type to correctly represent both possible table types.
  private readonly tables = new Map<string, Map<string, any> | LRUCache<string, any, any>>();
  
  // Generic Hash Indexing:
  // To avoid O(N) full table scans during find/findOne operations, we maintain in-memory hash indexes.
  // indexedColumns tracks which columns to index per table (extracted from TableSchema).
  private readonly indexedColumns = new Map<string, Set<string>>();
  // indexes is a nested map storing pointers to row IDs: Map<TableName, Map<ColumnName, Map<ColumnValue, Set<RowID>>>>
  private readonly indexes = new Map<string, Map<string, Map<unknown, Set<string>>>>();
  
  private readonly _hooks: Record<string, unknown> = {};
  private readonly options: InMemoryStorageOptions;

  constructor(options: InMemoryStorageOptions = {}) {
    this.options = options;
  }

  private getTable(table: string): Map<string, any> | LRUCache<string, any, any> {
    let t = this.tables.get(table);
    if (!t) {
      // If a global maxSize was provided in constructor, use it for new tables.
      if (this.options.maxSize) {
        t = new LRUCache<string, any, any>({
          maxSize: this.options.maxSize,
          sizeCalculation: (value, key) => Math.max(1, estimateSize(value) + estimateSize(key)),
          dispose: (value, key) => this.unindexRow(table, key, value),
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
      if (val !== null && val !== undefined && (typeof val === "string" || typeof val === "number" || typeof val === "boolean")) {
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
      if (val !== null && val !== undefined && (typeof val === "string" || typeof val === "number" || typeof val === "boolean")) {
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
  private getCandidates(table: string, criteria?: Record<string, unknown>): any[] {
    const tableMap = this.getTable(table);
    if (!criteria) return Array.from(tableMap.values());

    // 1. Primary Key Index Check O(1)
    if (typeof criteria.id === "string") {
      const r = tableMap.get(criteria.id);
      return r ? [r] : [];
    }

    // 2. Hash Index Check O(1)
    const cols = this.indexedColumns.get(table);
    if (cols) {
      for (const col of cols) {
        const val = criteria[col];
        // We only index primitives (string, number, boolean) to keep memory usage low
        if (val !== undefined && (typeof val === "string" || typeof val === "number" || typeof val === "boolean")) {
          const idSet = this.indexes.get(table)?.get(col)?.get(val);
          // If we queried by an indexed column and found nothing, we know the exact result is empty
          if (!idSet) return []; 
          
          const rows = [];
          for (const id of idSet) {
            const r = tableMap.get(id);
            if (r) rows.push(r);
          }
          return rows;
        }
      }
    }

    // 3. Fallback: Full Table Scan O(N)
    return Array.from(tableMap.values());
  }

  // @ts-expect-error The dynamic hook typing of TExtra breaks strict class assignment to the base interface.
  $extends(extension: StorageExtensions<TExtra>): this {
    if (extension.hooks) {
      for (const [resource, hooks] of Object.entries(extension.hooks)) {
        const currentHooks = (this._hooks)[resource] ?? {};
        (this._hooks)[resource] = {
          ...(currentHooks as Record<string, unknown>),
          ...(hooks as Record<string, unknown>),
        };
      }
    }
    return this;
  }

  private async executeOperation<TArgs, TResult>(
    resource: string,
    operation: StorageOperation,
    args: TArgs,
    context: any,
    query: (args: TArgs, options?: any) => Promise<TResult>,
  ): Promise<TResult> {
    const hooksForResource = this._hooks?.[resource] as Record<string, unknown> | undefined;
    const hook = hooksForResource?.[operation] as StorageHook<TArgs, TResult> | undefined;
    if (hook) {
      return hook({
        operation,
        args,
        context,
        table: resource,
        query: (newArgs: TArgs, options?: any) => query(newArgs, options),
      });
    }
    return query(args);
  }

  async migrate(schema: TableSchema) {
    for (const [table, columns] of Object.entries(schema)) {
      const limit = columns.$memoryLimit ?? this.options.maxSize;

      // 1. Automatic Index Extraction
      // Read the TableSchema to figure out which columns we should maintain Hash Indexes for.
      const idxCols = new Set<string>();
      if (columns.$partitionBy) {
        columns.$partitionBy.forEach(c => idxCols.add(c));
      }
      if (columns.$indexes) {
        columns.$indexes.forEach(idx => {
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
        idxCols.forEach(c => colMaps.set(c, new Map()));
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
            dispose: (value, key) => this.unindexRow(table, key, value),
          }),
        );
      } else if (!needsLRU && !existing) {
        this.tables.set(table, new Map());
      }
    }
  }

  private sortRows(rows: any[], orderByStr: string) {
    const [field, direction] = orderByStr.toLowerCase().split(" ");
    const isAsc = direction === "asc";

    rows.sort((a, b) => {
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

      // ID Tiebreaker for stable cursors
      const idA = String(a.id ?? "");
      const idB = String(b.id ?? "");
      return isAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
    });
  }

  async find<T>(
    resource: string,
    options: StorageQueryOptions,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    table: string = resource,
  ): Promise<T[]> {
    return this.executeOperation(resource, "list", options, context, async (args, opOpts) => {
      const t = opOpts?.table ?? table;
      const { limit, after, where } = args;
      if (limit !== undefined && limit <= 0) return [];

      let rows = this.getCandidates(t, where);

      // 1. Filter remaining properties
      if (where) {
        rows = rows.filter((r) => this.matchesWhere(r, where));
      }

      // 2. Sort explicitly if orderBy is provided
      if (args.orderBy) {
        this.sortRows(rows, args.orderBy);
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
        out.push(mapper(item));
        if (limit && out.length === limit) break;
      }

      return out;
    });
  }

  async findOne<T>(
    resource: string,
    criteria: Record<string, unknown>,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    options: { orderBy?: string } = {},
    table: string = resource,
  ): Promise<T | undefined> {
    return this.executeOperation(
      resource,
      "get",
      { ...criteria, ...options },
      context,
      async (args, opOpts) => {
        const t = opOpts?.table ?? table;
        
        let rows = this.getCandidates(t, args);

        rows = rows.filter((r) => {
          for (const [key, val] of Object.entries(args)) {
            if (key === "orderBy") continue;
            if (r[key] !== val) return false;
          }
          return true;
        });

        if (options.orderBy) {
          this.sortRows(rows, options.orderBy);
        }

        return rows.length > 0 ? mapper(rows[0]) : undefined;
      },
    );
  }

  async insert(
    resource: string,
    data: Record<string, unknown>,
    context: any = {},
    table: string = resource,
  ): Promise<{ changes: number }> {
    return this.executeOperation(resource, "create", data, context, async (args) => {
      const tableMap = this.getTable(table);
      const id = args.id as string;
      tableMap.set(id, args);
      this.indexRow(table, id, args);
      return { changes: 1 };
    });
  }

  async update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    context: any = {},
    table: string = resource,
  ): Promise<{ changes: number }> {
    return this.executeOperation(
      resource,
      "update",
      { id, data },
      context,
      async (args) => {
        const tableMap = this.getTable(table);
        const existing = tableMap.get(id);
        let newRow;
        if (existing) {
          this.unindexRow(table, id, existing);
          newRow = { ...existing, ...args.data };
        } else {
          newRow = { ...args.data, id };
        }
        tableMap.set(id, newRow);
        this.indexRow(table, id, newRow);
        return { changes: 1 };
      },
    );
  }

  async remove(
    resource: string,
    criteria: Record<string, unknown>,
    context: any = {},
    table: string = resource,
  ): Promise<{ changes: number }> {
    return this.executeOperation(resource, "delete", criteria, context, async (args) => {
      const tableMap = this.getTable(table);
      const rows = this.getCandidates(table, args);

      const toDelete = rows.filter((r) => {
        for (const [key, val] of Object.entries(args)) {
          if (r[key] !== val) return false;
        }
        return true;
      });

      for (const row of toDelete) {
        const id = row.id as string;
        this.unindexRow(table, id, row);
        tableMap.delete(id);
      }

      return { changes: toDelete.length };
    });
  }

  async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private matchesWhere(obj: Record<string, unknown>, where: ResourceWhere<any>): boolean {
    for (const [key, filter] of Object.entries(where)) {
      const isOperatorSyntax = key.includes(" ");
      const fieldPath = isOperatorSyntax ? key.split(" ")[0] : key;
      const operator = isOperatorSyntax ? key.split(" ")[1] : null;

      const value = fieldPath.includes(".")
        ? fieldPath.split(".").reduce((o, i) => (o as Record<string, unknown>)?.[i], obj as unknown)
        : obj[fieldPath];

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
      } else if (operator) {
        if (operator === ">" && !((value as any) > filter)) return false;
        if (operator === "<" && !((value as any) < filter)) return false;
        if (operator === ">=" && !((value as any) >= filter)) return false;
        if (operator === "<=" && !((value as any) <= filter)) return false;
      } else if (value !== filter) {
        return false;
      }
    }
    return true;
  }
}
