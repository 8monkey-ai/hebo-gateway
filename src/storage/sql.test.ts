import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteDialect } from "./dialects/sqlite";
import { SqlStorage } from "./sql";
import { conversationExtension } from "../endpoints/conversations/extension";

describe("SQL Storage Integration (via Extension)", () => {
  const createSetup = () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect }).$extends(conversationExtension);
    return { db, storage };
  };

  test("should handle full lifecycle and complex queries", async () => {
    const { storage } = createSetup();
    storage.$extends({
      schema: {
        conversation_items: {
          role: { type: "shorttext" },
          content: { type: "text" },
        },
      },
    });
    await storage.migrate();

    // 1. Create Conversation
    const conv = await storage.conversations.create({ metadata: { foo: "bar" } });

    // 2. Add Items
    const item1 = await storage.conversation_items.create({
      id: "item-1",
      type: "message",
      role: "user",
      content: "Msg 1",
      conversation_id: conv.id,
    });
    await storage.conversation_items.create({
      id: "item-2",
      type: "message",
      role: "assistant",
      content: "Msg 2",
      conversation_id: conv.id,
    });
    await storage.conversation_items.create({
      id: "item-3",
      type: "message",
      role: "user",
      content: "Msg 3",
      conversation_id: conv.id,
    });

    expect((item1).id).toBe("item-1");
    expect((item1).content).toBe("Msg 1");

    // 3. Get Item
    const item = await storage.conversation_items.findFirst({
      where: { id: "item-1", conversation_id: conv.id },
    });
    expect(item).toBeDefined();
    expect(item!.id).toBe("item-1");
    expect((item).content).toBe("Msg 1");

    // 4. List Items (Basic)
    const allItems = await storage.conversation_items.findMany({
      where: { conversation_id: conv.id },
      limit: 10,
      orderBy: { created_at: "asc" },
    });
    expect(allItems.length).toBe(3);
    expect((allItems)[0]!.id).toBe("item-1");

    // 5. List Items (Pagination: after)
    const page2 = await storage.conversation_items.findMany({
      where: { conversation_id: conv.id },
      limit: 1,
      orderBy: { created_at: "asc" },
      after: "item-1",
    });
    expect(page2.length).toBe(1);
    expect(page2[0]!.id).toBe("item-2");

    // 6. Delete Item
    await storage.conversation_items.delete({ id: "item-1", conversation_id: conv.id });
    const gone = await storage.conversation_items.findFirst({
      where: { id: "item-1", conversation_id: conv.id },
    });
    expect(gone).toBeUndefined();

    // 7. Update Conversation
    await storage.conversations.update(conv.id, { metadata: { foo: "updated" } });
    const updated = await storage.conversations.findFirst({ where: { id: conv.id } });
    expect(updated!.metadata!.foo).toBe("updated");

    // 8. Delete Conversation (should not delete items)
    await storage.conversations.delete({ id: conv.id });
    const goneConv = await storage.conversations.findFirst({ where: { id: conv.id } });
    expect(goneConv).toBeUndefined();

    // Items should still exist
    const leftoverItem = await storage.conversation_items.findFirst({
      where: { id: "item-2", conversation_id: conv.id },
    });
    expect(leftoverItem).toBeDefined();
  });

  test("should handle non-existent after ID by returning empty array", async () => {
    const { storage } = createSetup();
    await storage.migrate();

    const conv = await storage.conversations.create({ metadata: { test: "1" } });
    const items = await storage.conversation_items.findMany({
      where: { conversation_id: conv.id },
      after: "non-existent",
    });
    expect(items).toHaveLength(0);
  });

  test("should handle null and undefined metadata", async () => {
    const { storage } = createSetup();
    await storage.migrate();

    const c1 = await storage.conversations.create({ metadata: null as any });
    expect(c1.metadata).toBeNull();

    const c2 = await storage.conversations.create({});
    expect(c2.metadata).toBeNull();

    const r1 = await storage.conversations.findFirst({ where: { id: c1.id } });
    expect(r1!.metadata).toBeNull();
  });

  test("should list conversations with metadata filtering and pagination", async () => {
    const { storage } = createSetup();
    await storage.migrate();

    // 1. Seed
    const c1 = await storage.conversations.create({ metadata: { user: "1", tag: "a" } });
    await new Promise<void>((r) => {
      setTimeout(() =>{  r(); }, 10);
    });
    const c2 = await storage.conversations.create({ metadata: { user: "1", tag: "b" } });
    await new Promise<void>((r) => {
      setTimeout(() =>{  r(); }, 10);
    });
    const c3 = await storage.conversations.create({ metadata: { user: "2", tag: "a" } });

    // 2. List all (Default order: desc)
    const all = await storage.conversations.findMany({
      limit: 10,
      orderBy: { created_at: "desc" },
    });
    expect(all).toHaveLength(3);
    expect(all[0]!.id).toBe(c3.id);

    // 3. Filter by metadata (structured)
    const filtered = await storage.conversations.findMany({
      where: { "metadata.user": "1" },
      orderBy: { created_at: "asc" },
    });
    expect(filtered).toHaveLength(2);
    expect(filtered[0]!.id).toBe(c1.id);
    expect(filtered[1]!.id).toBe(c2.id);

    // 4. Pagination
    const page = await storage.conversations.findMany({
      limit: 1,
      orderBy: { created_at: "asc" },
      after: c1.id,
    });
    expect(page).toHaveLength(1);
    expect(page[0]!.id).toBe(c2.id);
  });

  test("should support structured operators in SQL", async () => {
    const { storage } = createSetup();
    storage.$extends({
      schema: {
        test_table: {
          id: { type: "id" },
          count: { type: "int" },
          tags: { type: "string" },
        },
      },
    });
    await storage.migrate();

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
    const { db, storage } = createSetup();

    db.run(
      "CREATE TABLE IF NOT EXISTS conversations_shard_1 (id TEXT PRIMARY KEY, created_at BIGINT, metadata TEXT)",
    );

    storage.$extends({
      query: {
        conversations: {
          create: ({ args, context, query }) => {
            if (context.shardId === 1) {
              return query({ ...args, table: "conversations_shard_1" });
            }
            return query(args);
          },
          findFirst: ({ args, context, query }) => {
            if (context.shardId === 1) {
              return query({ ...args, table: "conversations_shard_1" });
            }
            return query(args);
          },
        },
      },
    });

    // Create in shard 1
    await storage.conversations.create({ metadata: { shard: "1" } }, { shardId: 1 });

    const rawShard = db.prepare("SELECT count(*) as count FROM conversations_shard_1").get() as any;
    expect(rawShard.count).toBe(1);
  });
});
