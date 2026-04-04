import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteDialect } from "./dialects/sqlite";
import { SqlStorage } from "./sql";
import { ConversationRepository, CONVERSATION_SCHEMA } from "../endpoints/conversations/repository";

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
    // Wait a bit to ensure different created_at
    await new Promise((r) => setTimeout(r, 10));
    const c2 = await repo.createConversation({ metadata: { user: "1", tag: "b" } });
    await new Promise((r) => setTimeout(r, 10));
    const c3 = await repo.createConversation({ metadata: { user: "2", tag: "a" } });

    // 2. List all (Default order: desc)
    const all = await repo.listConversations({ limit: 10, order: "desc" });
    expect(all).toHaveLength(3);
    // SQLite might have same timestamp if too fast, but we added timeouts
    expect(all[0]!.id).toBe(c3.id);

    // 3. Filter by metadata
    const filtered = await repo.listConversations({
      metadata: { user: "1" } as any,
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

  test("should use UPSERT (INSERT) logic and preserve original created_at", async () => {
    const { repo, db } = createSetup();
    await repo.migrate();

    const conv = await repo.createConversation({ metadata: { initial: true } });
    const originalCreatedAt = conv.created_at;

    // Wait so a new date would be different
    await new Promise((r) => setTimeout(r, 10));

    await repo.updateConversation(conv.id, { metadata: { updated: true } });
    
    const updated = await repo.getConversation(conv.id);
    expect(updated).toBeDefined();
    expect(updated!.metadata).toEqual({ updated: true });
    // IMPORTANT: created_at must be preserved exactly
    expect(updated!.created_at).toBe(originalCreatedAt);
  });

  test("should support additionalFields as top-level columns", async () => {
    const { repo } = createSetup();
    await repo.migrate({
      conversations: { org_id: { type: "VARCHAR(255)" } },
    });

    const conv = await repo.createConversation({ org_id: "org-1" } as any);
    expect((conv as any).org_id).toBe("org-1");

    const retrieved = await repo.getConversation(conv.id);
    expect((retrieved as any).org_id).toBe("org-1");

    const filtered = await repo.listConversations({ where: { org_id: "org-1" } as any });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe(conv.id);
  });

  test("should support hooks for table name mutation", async () => {
    const { db, storage, repo } = createSetup();

    // Create shard table manually
    db.run(
      "CREATE TABLE IF NOT EXISTS conversations_shard_1 (id TEXT PRIMARY KEY, created_at BIGINT, metadata TEXT)",
    );

    storage.$extends({
      hooks: {
        conversations: {
          create: async ({ args, context, query }) => {
            if (context.shardId === 1) {
              return query(args, { table: "conversations_shard_1" });
            }
            return query(args);
          },
        },
      },
    });

    // 1. Create in shard 1
    const conv = await repo.createConversation({ metadata: { shard: "1" } }, { shardId: 1 });

    // 2. Verify it's in shard 1 table
    const rawShard = db.prepare("SELECT count(*) as count FROM conversations_shard_1").get() as any;
    expect(rawShard.count).toBe(1);
  });
});
