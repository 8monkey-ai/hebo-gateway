import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteDialect } from "./dialects/sqlite";
import { SqlStorage } from "./sql";

describe("SQLite Storage (In-Memory)", () => {
  test("should handle full lifecycle and complex queries", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - Bun.sqlite.Database is not perfectly matched with BetterSqlite3Database in types but works
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    // 1. Create Conversation
    const conv = await storage.createConversation({ metadata: { foo: "bar" } });

    // 2. Add Items with sequential IDs to verify sorting/pagination
    const itemInputs = [
      { id: "item-1", type: "message" as const, role: "user" as const, content: "Msg 1" },
      { id: "item-2", type: "message" as const, role: "assistant" as const, content: "Msg 2" },
      { id: "item-3", type: "message" as const, role: "user" as const, content: "Msg 3" },
    ];

    await storage.addItems(conv.id, itemInputs);

    // 3. Get Item
    const item = await storage.getItem(conv.id, "item-1");
    expect(item).toBeDefined();
    expect(item!.id).toBe("item-1");
    expect((item as Record<string, unknown>)["content"]).toBe("Msg 1");

    // 4. List Items (Basic)
    const allItems = await storage.listItems(conv.id, { limit: 10, order: "asc" });
    expect(allItems!.length).toBe(3);
    expect(allItems![0]!.id).toBe("item-1");

    // 5. List Items (Pagination: after)
    const page2 = await storage.listItems(conv.id, {
      limit: 2,
      order: "asc",
      after: "item-1",
    });
    expect(page2!.length).toBe(2);
    expect(page2![0]!.id).toBe("item-2");
    expect(page2![1]!.id).toBe("item-3");

    // 6. List Items (Pagination: order desc)
    const descItems = await storage.listItems(conv.id, { limit: 10, order: "desc" });
    expect(descItems![0]!.id).toBe("item-3");

    // 7. Delete Item
    await storage.deleteItem(conv.id, "item-2");
    const afterDeleteItems = await storage.listItems(conv.id, { limit: 10, order: "asc" });
    expect(afterDeleteItems!.length).toBe(2);
    expect(afterDeleteItems!.find((i) => i.id === "item-2")).toBeUndefined();

    // 8. Delete Conversation
    const deleteRes = await storage.deleteConversation(conv.id);
    expect(deleteRes.deleted).toBe(true);
    const finalGet = await storage.getConversation(conv.id);
    expect(finalGet).toBeUndefined();

    db.close();
  });

  test("should handle non-existent after ID by returning first page", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    const conv = await storage.createConversation({});

    const itemInputs = [
      { id: "item-1", type: "message" as const, role: "user" as const, content: "Msg 1" },
      { id: "item-2", type: "message" as const, role: "user" as const, content: "Msg 2" },
    ];
    await storage.addItems(conv.id, itemInputs);

    // Provide a non-existent 'after' ID
    const results = await storage.listItems(conv.id, {
      limit: 10,
      order: "asc",
      after: "non-existent-id",
    });

    // Should return 0 items for an invalid cursor
    expect(results!.length).toBe(0);

    db.close();
  });

  test("should return undefined from listItems for a non-existent conversation", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    const results = await storage.listItems("non-existent-conv-id", {
      limit: 10,
    });

    expect(results).toBeUndefined();

    db.close();
  });

  test("should handle null and undefined metadata", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    // Test null metadata
    const convNull = await storage.createConversation({ metadata: null });
    const retrievedNull = await storage.getConversation(convNull.id);
    expect(retrievedNull!.metadata).toBeNull();

    // Test undefined metadata (should default to null)
    const convUndef = await storage.createConversation({ metadata: undefined });
    const retrievedUndef = await storage.getConversation(convUndef.id);
    expect(retrievedUndef!.metadata).toBeNull();

    // Test updating to null
    await storage.updateConversation(convUndef.id, { metadata: null });
    const updatedNull = await storage.getConversation(convUndef.id);
    expect(updatedNull!.metadata).toBeNull();

    // Test updating to empty object
    await storage.updateConversation(convNull.id, { metadata: {} });
    const updatedObj = await storage.getConversation(convNull.id);
    expect(updatedObj!.metadata).toEqual({});

    db.close();
  });

  test("should list conversations with metadata filtering and pagination", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    // 1. Create conversations with varying metadata
    const c1 = await storage.createConversation({ metadata: { user: "1", tag: "a" } });
    // Ensure unique timestamps for predictable sorting in SQLite
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });
    const c2 = await storage.createConversation({ metadata: { user: "1", tag: "b" } });
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });
    const c3 = await storage.createConversation({ metadata: { user: "2", tag: "a" } });

    // 2. List all (Default order: desc)
    const all = await storage.listConversations({ limit: 10 });
    expect(all).toHaveLength(3);
    expect(all[0]!.id).toBe(c3.id);

    // 3. Filter by single metadata key
    const user1 = await storage.listConversations({
      limit: 10,
      where: { metadata: { user: "1" } },
    });
    expect(user1).toHaveLength(2);
    expect(user1.map((c) => c.id)).toContain(c1.id);
    expect(user1.map((c) => c.id)).toContain(c2.id);

    // 4. Filter by multiple metadata keys (AND)
    const both = await storage.listConversations({
      limit: 10,
      where: { metadata: { user: "1", tag: "a" } },
    });
    expect(both).toHaveLength(1);
    expect(both[0]!.id).toBe(c1.id);

    db.close();
  });

  test("should handle metadata keys with single quotes", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    const keyWithQuote = "foo'bar";
    const c1 = await storage.createConversation({ metadata: { [keyWithQuote]: "baz" } });
    await storage.createConversation({ metadata: { simple: "qux" } });

    const results = await storage.listConversations({
      limit: 10,
      where: { metadata: { [keyWithQuote]: "baz" } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(c1.id);
    expect(results[0]!.metadata).toEqual({ [keyWithQuote]: "baz" });

    db.close();
  });

  test("should support additionalFields as top-level columns", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({
      dialect,
      additionalFields: {
        conversations: {
          org_id: { type: "TEXT", index: true },
        },
      },
    });
    await storage.migrate();

    // 1. Create with extra field
    const conv = await storage.createConversation({
      org_id: "org_1",
      metadata: { foo: "bar" },
    });
    expect(conv["org_id"]).toBe("org_1");

    // 2. Verify it's in the DB as a top-level column
    const raw = db.prepare("SELECT * FROM conversations WHERE id = ?").get(conv.id) as any;
    expect(raw.org_id).toBe("org_1");

    // 3. Query by extra field
    const results = await storage.listConversations({
      where: { org_id: "org_1" },
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(conv.id);
    expect(results[0]!["org_id"]).toBe("org_1");

    db.close();
  });

  test("should support Prisma-style hooks for table name mutation", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({ dialect });
    await storage.migrate();

    // Manually create a second table for sharding test
    db.run("CREATE TABLE conversations_shard_1 AS SELECT * FROM conversations WHERE 1=0");

    storage.$extends({
      query: {
        conversations: {
          list: async ({ args, context, query }) => {
            const shardTable = `conversations_shard_${context.shardId}`;
            return query(args, { table: shardTable });
          },
          create: async ({ args, context, query }) => {
            const shardTable = `conversations_shard_${context.shardId}`;
            return query(args, { table: shardTable });
          },
        },
      },
    });

    // 1. Create in shard 1
    const conv = await storage.createConversation({ metadata: { shard: "1" } }, { shardId: 1 });

    // 2. Verify it's in shard 1 table
    const rawShard = db.prepare("SELECT count(*) as count FROM conversations_shard_1").get() as any;
    expect(rawShard.count).toBe(1);

    // 3. Verify it's NOT in default table
    const rawDefault = db.prepare("SELECT count(*) as count FROM conversations").get() as any;
    expect(rawDefault.count).toBe(0);

    // 4. List from shard 1
    const results = await storage.listConversations({ limit: 10 }, { shardId: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(conv.id);

    db.close();
  });

  test("should support Drizzle-style operators in where clause", async () => {
    const db = new Database(":memory:");
    // @ts-expect-error - types mismatch
    const dialect = new SqliteDialect({ client: db });
    const storage = new SqlStorage({
      dialect,
      additionalFields: {
        conversations: {
          priority: { type: "INTEGER", default: "0" },
        },
      },
    });
    await storage.migrate();

    await storage.createConversation({ priority: 1, metadata: { name: "low" } });
    await storage.createConversation({ priority: 10, metadata: { name: "high" } });
    await storage.createConversation({ priority: 5, metadata: { name: "mid" } });

    // 1. GT operator
    const high = await storage.listConversations({
      where: { priority: { gt: 5 } },
    });
    expect(high).toHaveLength(1);
    expect(high[0]!["priority"]).toBe(10);

    // 2. IN operator
    const selected = await storage.listConversations({
      where: { priority: { in: [1, 5] } },
    });
    expect(selected).toHaveLength(2);

    // 3. Contains (LIKE) operator on metadata
    const mid = await storage.listConversations({
      where: { metadata: { name: { contains: "mi" } } },
    });
    expect(mid).toHaveLength(1);
    expect(mid[0]!["priority"]).toBe(5);

    db.close();
  });
});
