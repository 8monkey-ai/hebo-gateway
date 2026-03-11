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
    await storage.updateConversation(convUndef.id, null);
    const updatedNull = await storage.getConversation(convUndef.id);
    expect(updatedNull!.metadata).toBeNull();

    // Test updating to empty object
    await storage.updateConversation(convNull.id, {});
    const updatedObj = await storage.getConversation(convNull.id);
    expect(updatedObj!.metadata).toEqual({});

    db.close();
  });
});
