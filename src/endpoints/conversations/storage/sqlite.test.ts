import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createBetterSqlite3Storage } from "./sqlite";
import { createConversation, createConversationItem } from "../utils";

describe("SQLite Storage (In-Memory)", () => {
  test("should handle full lifecycle and complex queries", async () => {
    const db = new Database(":memory:");
    const storage = createBetterSqlite3Storage(db as any);
    await storage.migrate();

    // 1. Create Conversation
    const conv = createConversation({ metadata: { foo: "bar" } });
    await storage.createConversation(conv);

    // 2. Add Items
    const items = [
      createConversationItem({ type: "message", role: "user", content: "Msg 1" }),
      createConversationItem({ type: "message", role: "assistant", content: "Msg 2" }),
      createConversationItem({ type: "message", role: "user", content: "Msg 3" }),
    ];
    // Set explicit timestamps to ensure predictable ordering for pagination tests
    items[0].created_at = 1000;
    items[1].created_at = 2000;
    items[2].created_at = 3000;

    await storage.addItems(conv.id, items);

    // 3. Get Item
    const item = await storage.getItem(conv.id, items[0].id);
    expect(item).toBeDefined();
    expect(item?.id).toBe(items[0].id);
    expect((item as any).content).toBe("Msg 1");

    // 4. List Items (Basic)
    const allItems = await storage.listItems(conv.id, { limit: 10, order: "asc" });
    expect(allItems.length).toBe(3);
    expect(allItems[0].id).toBe(items[0].id);

    // 5. List Items (Pagination: after)
    const page2 = await storage.listItems(conv.id, {
      limit: 2,
      order: "asc",
      after: items[0].id,
    });
    expect(page2.length).toBe(2);
    expect(page2[0].id).toBe(items[1].id);
    expect(page2[1].id).toBe(items[2].id);

    // 6. List Items (Pagination: order desc)
    const descItems = await storage.listItems(conv.id, { limit: 10, order: "desc" });
    expect(descItems[0].id).toBe(items[2].id);

    // 7. Delete Item
    await storage.deleteItem(conv.id, items[1].id);
    const afterDeleteItems = await storage.listItems(conv.id, { limit: 10, order: "asc" });
    expect(afterDeleteItems.length).toBe(2);
    expect(afterDeleteItems.find((i) => i.id === items[1].id)).toBeUndefined();

    // 8. Delete Conversation
    const deleteRes = await storage.deleteConversation(conv.id);
    expect(deleteRes.deleted).toBe(true);
    const finalGet = await storage.getConversation(conv.id);
    expect(finalGet).toBeUndefined();

    db.close();
  });

  test("should handle non-existent after ID by returning first page", async () => {
    const db = new Database(":memory:");
    const storage = createBetterSqlite3Storage(db as any);
    await storage.migrate();

    const conv = createConversation({});
    await storage.createConversation(conv);

    const items = [
      createConversationItem({ type: "message", role: "user", content: "Msg 1" }),
      createConversationItem({ type: "message", role: "user", content: "Msg 2" }),
    ];
    items[0].created_at = 1000;
    items[1].created_at = 2000;
    await storage.addItems(conv.id, items);

    // Provide a non-existent 'after' ID
    const results = await storage.listItems(conv.id, {
      limit: 10,
      order: "asc",
      after: "non-existent-id",
    });

    // Should return both items (ignoring 'after' filter)
    expect(results.length).toBe(2);
    expect(results[0].id).toBe(items[0].id);

    db.close();
  });

  test("should handle null and undefined metadata", async () => {
    const db = new Database(":memory:");
    const storage = createBetterSqlite3Storage(db as any);
    await storage.migrate();

    // Test null metadata
    const convNull = createConversation({ metadata: null as any });
    await storage.createConversation(convNull);
    const retrievedNull = await storage.getConversation(convNull.id);
    expect(retrievedNull?.metadata).toBeNull();

    // Test undefined metadata (should default to null)
    const convUndef = createConversation({ metadata: undefined });
    await storage.createConversation(convUndef);
    const retrievedUndef = await storage.getConversation(convUndef.id);
    expect(retrievedUndef?.metadata).toBeNull();

    // Test updating to null
    await storage.updateConversation(convUndef.id, null as any);
    const updatedNull = await storage.getConversation(convUndef.id);
    expect(updatedNull?.metadata).toBeNull();

    // Test updating to empty object
    await storage.updateConversation(convNull.id, {});
    const updatedObj = await storage.getConversation(convNull.id);
    expect(updatedObj?.metadata).toEqual({});

    db.close();
  });
});
