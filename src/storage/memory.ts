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
        });
      } else {
        t = new Map();
      }
      this.tables.set(table, t);
    }
    return t;
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

      // If a limit is specified (either in schema or constructor), ensure we use an LRUCache.
      const existing = this.tables.get(table);
      const needsLRU = !!limit;
      const isLRU = existing instanceof LRUCache;
      const disposeHook = columns.$dispose;

      if (needsLRU && (!isLRU || (existing as any).maxSize !== limit)) {
        this.tables.set(
          table,
          new LRUCache<string, any, any>({
            maxSize: limit,
            sizeCalculation: (value, key) => Math.max(1, estimateSize(value) + estimateSize(key)),
            noDisposeOnSet: true,
            dispose: disposeHook ? (value, key) => disposeHook(key, value) : undefined,
          }),
        );
      } else if (!needsLRU && !existing) {
        this.tables.set(table, new Map());
      }
    }
  }

  async find<T>(
    resource: string,
    options: StorageQueryOptions,
    context: any = {},
    mapper: RowMapper<T> = (r) => r as T,
    table: string = resource,
  ): Promise<T[]> {
    return this.executeOperation(resource, "list", options, context, async (args, opOpts) => {
      const tableMap = this.getTable(opOpts?.table ?? table);
      const { limit, after, where } = args;
      if (limit !== undefined && limit <= 0) return [];

      let rows = Array.from(tableMap.values());

      // 1. Filter
      if (where) {
        rows = rows.filter((r) => this.matchesWhere(r, where));
      }

      // 2. Sort (Robust handling for Dates and ID tiebreakers)
      const orderSpec = args.orderBy ?? "created_at desc";
      const [field, direction] = orderSpec.toLowerCase().split(" ");
      const isAsc = direction === "asc";

      rows.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        // Normalize Dates to timestamps
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();

        if (valA !== valB) {
          if (valA < valB) return isAsc ? -1 : 1;
          return isAsc ? 1 : -1;
        }

        // ID Tiebreaker for stable cursors
        const idA = String(a.id ?? "");
        const idB = String(b.id ?? "");
        return isAsc ? idA.localeCompare(idB) : idB.localeCompare(idA);
      });

      // 3. Cursor Pagination: after
      const out: T[] = [];
      if (isAsc) {
        let seen = after === null || after === undefined;
        for (const item of rows) {
          if (!seen) {
            if (item.id === after) seen = true;
            continue;
          }
          out.push(mapper(item));
          if (limit && out.length === limit) break;
        }
      } else {
        // DESC Bounded Buffer
        for (const item of rows) {
          if (after !== null && after !== undefined && item.id === after) break;
          out.push(mapper(item));
          if (limit && out.length > limit) out.shift();
        }
        out.reverse();
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
        const tableMap = this.getTable(opOpts?.table ?? table);
        const rows = Array.from(tableMap.values()).filter((r) => {
          for (const [key, val] of Object.entries(args)) {
            if (key === "orderBy") continue;
            if (r[key] !== val) return false;
          }
          return true;
        });

        if (options.orderBy) {
          const orderSpec = options.orderBy || "created_at desc";
          const [field, direction] = orderSpec.toLowerCase().split(" ");
          const isAsc = direction === "asc";
          rows.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];
            if (valA instanceof Date) valA = valA.getTime();
            if (valB instanceof Date) valB = valB.getTime();
            if (valA < valB) return isAsc ? -1 : 1;
            if (valA > valB) return isAsc ? 1 : -1;
            return String(a.id ?? "").localeCompare(String(b.id ?? ""));
          });
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
      tableMap.set(args.id as string, args);
      return { changes: 1 };
    });
  }

  async update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    options: { upsert?: boolean; createdAt?: number | Date },
    context: any = {},
    table: string = resource,
  ): Promise<{ changes: number }> {
    return this.executeOperation(
      resource,
      "update",
      { id, data, options },
      context,
      async (args) => {
        const tableMap = this.getTable(table);
        const existing = tableMap.get(id);
        if (existing) {
          tableMap.set(id, { ...existing, ...args.data });
          return { changes: 1 };
        } else if (args.options.upsert) {
          const createdAt =
            args.options.createdAt instanceof Date
              ? args.options.createdAt
              : new Date(args.options.createdAt ?? Date.now());
          tableMap.set(id, {
            ...args.data,
            id,
            created_at: createdAt,
          });
          return { changes: 1 };
        }
        return { changes: 0 };
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
      const toDelete = Array.from(tableMap.values()).filter((r) => {
        for (const [key, val] of Object.entries(args)) {
          if (r[key] !== val) return false;
        }
        return true;
      });

      for (const row of toDelete) {
        tableMap.delete(row.id);
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
