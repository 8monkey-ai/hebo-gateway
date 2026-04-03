import { LRUCache } from "lru-cache";
import { v7 as uuidv7 } from "uuid";
import type {
  ConversationStorage,
  ConversationEntityWithExtra,
  ConversationItemEntityWithExtra,
  ConversationMetadata,
  ConversationItemInput,
  ConversationQueryOptions,
  StorageOperation,
  StorageExtensions,
  StorageHook,
} from "./types";

export class InMemoryStorage<TExtra = Record<string, any>> implements ConversationStorage<TExtra> {
  private conversations = new Map<string, ConversationEntityWithExtra<any>>();
  private items: LRUCache<string, ConversationItemEntityWithExtra<any>[]>;
  private _hooks: StorageExtensions<TExtra>["query"] = {};

  constructor(options?: { hooks?: StorageExtensions<TExtra>; maxSize?: number }) {
    this._hooks = options?.hooks?.query ?? {};

    // Default to 256MB
    const maxSize = options?.maxSize ?? 256 * 1024 * 1024;

    this.items = new LRUCache<string, ConversationItemEntityWithExtra<any>[]>({
      maxSize,
      sizeCalculation: (items) => Math.max(1, this.estimateSize(items)),
      noDisposeOnSet: true,
      dispose: (_value, key) => {
        this.conversations.delete(key);
      },
    });
  }

  private estimateSize(root: unknown): number {
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
    query: (args: TArgs) => Promise<TResult>,
  ): Promise<TResult> {
    const hooksForResource = this._hooks?.[resource] as Record<string, unknown> | undefined;
    const hook = hooksForResource?.[operation as string] as StorageHook<TArgs, TResult> | undefined;
    if (hook) {
      return hook({
        operation: operation as StorageOperation,
        args,
        context,
        table: resource,
        query: (newArgs: TArgs) => query(newArgs),
      });
    }
    return query(args);
  }

  async createConversation(
    params: {
      metadata?: ConversationMetadata;
      items?: ConversationItemInput[];
    } & Partial<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra>> {
    return this.executeOperation("conversations", "create", params, context, async (args) => {
      const id = uuidv7();
      const now = Date.now();
      const conversation = {
        id,
        created_at: now,
        metadata: args.metadata ?? null,
        ...args,
      } as ConversationEntityWithExtra<TExtra>;

      this.conversations.set(id, conversation);
      this.items.set(id, []);

      if (args.items?.length) {
        await this.addItems(id, args.items, context);
      }

      return conversation;
    });
  }

  async getConversation(
    id: string,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation("conversations", "get", { id }, context, async (args) => {
      return this.conversations.get(args.id) as ConversationEntityWithExtra<TExtra> | undefined;
    });
  }

  async listConversations(
    params: ConversationQueryOptions<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra>[]> {
    return this.executeOperation("conversations", "list", params, context, async (args) => {
      let list = Array.from(this.conversations.values()) as ConversationEntityWithExtra<TExtra>[];

      if (args.where) {
        list = list.filter((c) => this.matchesWhere(c as Record<string, unknown>, args.where!));
      }

      const isAsc = args.order === "asc";
      list.sort((a, b) => (isAsc ? a.created_at - b.created_at : b.created_at - a.created_at));

      if (args.after) {
        const afterConv = this.conversations.get(args.after);
        if (afterConv) {
          const index = list.findIndex((c) => c.id === args.after);
          if (index !== -1) {
            list = list.slice(index + 1);
          }
        }
      }

      if (args.limit !== undefined) {
        list = list.slice(0, args.limit);
      }

      return list;
    });
  }

  async updateConversation(
    id: string,
    params: { metadata?: ConversationMetadata } & Partial<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation(
      "conversations",
      "update",
      { id, params },
      context,
      async (args) => {
        const conversation = this.conversations.get(args.id);
        if (!conversation) return;

        const updated = {
          ...conversation,
          ...args.params,
          metadata: args.params.metadata ?? conversation.metadata,
        } as ConversationEntityWithExtra<TExtra>;

        this.conversations.set(args.id, updated);
        return updated;
      },
    );
  }

  async deleteConversation(id: string, context?: any): Promise<{ id: string; deleted: boolean }> {
    return this.executeOperation("conversations", "delete", { id }, context, async (args) => {
      const deleted = this.conversations.delete(args.id);
      this.items.delete(args.id);
      return { id: args.id, deleted };
    });
  }

  async addItems(
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
        const conversation = this.conversations.get(args.conversationId);
        if (!conversation) return;

        const currentItems = this.items.get(args.conversationId) ?? [];
        const now = Date.now();
        const newItems = args.items.map((item, i) => ({
          ...item,
          id: item.id ?? uuidv7(),
          conversation_id: args.conversationId,
          created_at: now + i,
        })) as ConversationItemEntityWithExtra<TExtra>[];

        this.items.set(args.conversationId, [...currentItems, ...newItems]);
        return newItems;
      },
    );
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
      async (args) => {
        const items = this.items.get(args.conversationId);
        return items?.find((item) => item.id === args.itemId) as
          | ConversationItemEntityWithExtra<TExtra>
          | undefined;
      },
    );
  }

  async deleteItem(
    conversationId: string,
    itemId: string,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined> {
    return this.executeOperation(
      "conversation_items",
      "delete",
      { conversationId, itemId },
      context,
      async (args) => {
        const items = this.items.get(args.conversationId);
        if (!items) return;

        this.items.set(
          args.conversationId,
          items.filter((item) => item.id !== args.itemId),
        );
        return this.conversations.get(args.conversationId) as
          | ConversationEntityWithExtra<TExtra>
          | undefined;
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
      async (args) => {
        let list = this.items.get(args.conversationId) as
          | ConversationItemEntityWithExtra<TExtra>[]
          | undefined;
        if (!list) return;

        if (args.where) {
          list = list.filter((item) =>
            this.matchesWhere(item as Record<string, unknown>, args.where!),
          );
        }

        const isAsc = args.order === "asc";
        list = [...list].toSorted((a, b) =>
          isAsc ? a.created_at - b.created_at : b.created_at - a.created_at,
        );

        if (args.after) {
          const index = list.findIndex((item) => item.id === args.after);
          if (index !== -1) {
            list = list.slice(index + 1);
          }
        }

        if (args.limit !== undefined) {
          list = list.slice(0, args.limit);
        }

        return list;
      },
    );
  }

  private matchesWhere(obj: Record<string, unknown>, where: Record<string, unknown>): boolean {
    for (const [key, filter] of Object.entries(where)) {
      const value = key.includes(".")
        ? key.split(".").reduce((o, i) => (o as Record<string, unknown>)?.[i], obj as unknown)
        : (obj[key] ??
          (obj["metadata"] as Record<string, unknown>)?.[key] ??
          (obj["data"] as Record<string, unknown>)?.[key]);

      if (!this.matchesFilter(value, filter)) return false;
    }
    return true;
  }

  private matchesFilter(value: unknown, filter: unknown): boolean {
    if (filter === null || typeof filter !== "object" || Array.isArray(filter)) {
      return value === filter;
    }

    const op = filter as Record<string, unknown>;
    if ("eq" in op && value !== op["eq"]) return false;
    if ("ne" in op && value === op["ne"]) return false;
    if (
      "gt" in op &&
      !(typeof value === "number" && typeof op["gt"] === "number" && value > op["gt"])
    )
      return false;
    if (
      "gte" in op &&
      !(typeof value === "number" && typeof op["gte"] === "number" && value >= op["gte"])
    )
      return false;
    if (
      "lt" in op &&
      !(typeof value === "number" && typeof op["lt"] === "number" && value < op["lt"])
    )
      return false;
    if (
      "lte" in op &&
      !(typeof value === "number" && typeof op["lte"] === "number" && value <= op["lte"])
    )
      return false;
    if ("in" in op && Array.isArray(op["in"]) && !op["in"].includes(value)) return false;
    if (
      "contains" in op &&
      !(
        typeof value === "string" &&
        typeof op["contains"] === "string" &&
        value.includes(op["contains"])
      )
    )
      return false;
    if ("isNull" in op && (op["isNull"] ? value !== null : value === null)) return false;

    return true;
  }
}
