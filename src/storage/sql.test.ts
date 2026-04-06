import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteDialect } from "./dialects/sqlite";
import { SqlStorage } from "./sql";
import { ConversationRepository } from "../endpoints/conversations/repository";

describe("SQL Storage Integration (via ConversationRepository)", () => {
  const createSetup = () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    const repo = new ConversationRepository(storage);
    return { db, storage, repo };
  };

  test("should handle full lifecycle and complex queries", async () => {
    const { repo } = createSetup();
    await repo.migrate({
      conversation_items: {
        role: { type: "VARCHAR(64)" },
        content: { type: "TEXT" },
      },
    });

    // 1. Create Conversation
    const conv = await repo.createConversation({ metadata: { foo: "bar" } });

    // 2. Add Items
    const itemInputs = [
      { id: "item-1", type: "message", role: "user", content: "Msg 1" },
      { id: "item-2", type: "message", role: "assistant", content: "Msg 2" },
      { id: "item-3", type: "message", role: "user", content: "Msg 3" },
    ];

    await repo.addItems(conv.id, itemInputs);

    // 3. Get Item
    const item = await repo.getItem(conv.id, "item-1");
    expect(item).toBeDefined();
    expect(item!.id).toBe("item-1");
    expect((item as any).content).toBe("Msg 1");

    // 4. List Items (Basic)
    const allItems = await repo.listItems(conv.id, { limit: 10, order: "asc" });
    expect(allItems!.length).toBe(3);
    expect(allItems![0]!.id).toBe("item-1");

    // 5. List Items (Pagination: after)
    const page2 = await repo.listItems(conv.id, {
      limit: 2,
      order: "asc",
      after: "item-1",
    });
    expect(page2!.length).toBe(2);
    expect(page2![0]!.id).toBe("item-2");

    // 6. Delete Item
    await repo.deleteItem(conv.id, "item-1");
    const gone = await repo.getItem(conv.id, "item-1");
    expect(gone).toBeUndefined();

    // 7. Update Conversation
    await repo.updateConversation(conv.id, { metadata: { foo: "updated" } });
    const updated = await repo.getConversation(conv.id);
    expect(updated!.metadata!.foo).toBe("updated");

    // 8. Delete Conversation (should not delete items)
    await repo.deleteConversation(conv.id);
    const goneConv = await repo.getConversation(conv.id);
    expect(goneConv).toBeUndefined();
    
    // Items should still exist
    const leftoverItem = await repo.getItem(conv.id, "item-2");
    expect(leftoverItem).toBeDefined();
  });

  test("should handle non-existent after ID by returning empty array", async () => {
    const { repo } = createSetup();
    await repo.migrate();

    const conv = await repo.createConversation({ metadata: { test: "1" } });
    const items = await repo.listItems(conv.id, { after: "non-existent" });
    expect(items).toHaveLength(0);
  });

  test("should handle null and undefined metadata", async () => {
    const { repo } = createSetup();
    await repo.migrate();

    const c1 = await repo.createConversation({ metadata: null as any });
    expect(c1.metadata).toBeNull();

    const c2 = await repo.createConversation({});
    expect(c2.metadata).toBeNull();

    const r1 = await repo.getConversation(c1.id);
    expect(r1!.metadata).toBeNull();
  });

  test("should list conversations with metadata filtering and pagination", async () => {
    const { repo } = createSetup();
    await repo.migrate();

    // 1. Seed
    const c1 = await repo.createConversation({ metadata: { user: "1", tag: "a" } });
    await new Promise((r) => setTimeout(r, 10));
    const c2 = await repo.createConversation({ metadata: { user: "1", tag: "b" } });
    await new Promise((r) => setTimeout(r, 10));
    const c3 = await repo.createConversation({ metadata: { user: "2", tag: "a" } });

    // 2. List all (Default order: desc)
    const all = await repo.listConversations({ limit: 10, order: "desc" });
    expect(all).toHaveLength(3);
    expect(all[0]!.id).toBe(c3.id);

    // 3. Filter by metadata (structured)
    const filtered = await repo.listConversations({
      metadata: { user: "1" },
      order: "asc",
    });
    expect(filtered).toHaveLength(2);
    expect(filtered[0]!.id).toBe(c1.id);
    expect(filtered[1]!.id).toBe(c2.id);

    // 4. Pagination
    const page = await repo.listConversations({
      limit: 1,
      order: "asc",
      after: c1.id,
    });
    expect(page).toHaveLength(1);
    expect(page[0]!.id).toBe(c2.id);
  });

  test("should support structured operators in SQL", async () => {
    const { storage } = createSetup();
    await storage.migrate({
      test_table: {
        id: { type: "TEXT" },
        count: { type: "INTEGER" },
        tags: { type: "TEXT" }
      }
    });

    await storage.test_table.create({ id: "1", count: 10, tags: "a,b" });
    await storage.test_table.create({ id: "2", count: 20, tags: "b,c" });
    await storage.test_table.create({ id: "3", count: 30, tags: "c,d" });

    // GT
    const gt = await storage.test_table.findMany({ where: { count: { gt: 15 } } });
    expect(gt).toHaveLength(2);

    // IN
    const inOp = await storage.test_table.findMany({ where: { id: { in: ["1", "3"] } } });
    expect(inOp).toHaveLength(2);

    // CONTAINS (LIKE)
    const contains = await storage.test_table.findMany({ where: { tags: { contains: "b" } } });
    expect(contains).toHaveLength(2);

    // NE
    const ne = await storage.test_table.findMany({ where: { count: { ne: 20 } } });
    expect(ne).toHaveLength(2);
  });

  test("should support hooks for table name mutation", async () => {
    const { db, storage, repo } = createSetup();

    db.run(
      "CREATE TABLE IF NOT EXISTS conversations_shard_1 (id TEXT PRIMARY KEY, created_at BIGINT, metadata TEXT)",
    );

    storage.$extends({
      query: {
        conversations: {
          create: async ({ args, context, query }) => {
            if (context.shardId === 1) {
              return query({ ...args, table: "conversations_shard_1" } as any);
            }
            return query(args);
          },
        },
      },
    });

    // Create in shard 1
    await repo.createConversation({ metadata: { shard: "1" } }, { shardId: 1 });

    const rawShard = db.prepare("SELECT count(*) as count FROM conversations_shard_1").get() as any;
    expect(rawShard.count).toBe(1);
  });
});
