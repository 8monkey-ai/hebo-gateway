import { describe, expect, test } from "bun:test";
import { InMemoryStorage } from "./memory";

describe("InMemoryStorage (Size-Based LRU)", () => {
  test("should evict items based on estimated byte size", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate({
      cache: {
        id: { type: "string" },
        $memoryLimit: 1000, // Very small limit (1KB)
      },
    });

    // Each item is ~200 bytes (string "a" repeated 100 times)
    const largeValue = "a".repeat(100);

    // Insert 10 items (Total ~2000 bytes, should trigger eviction)
    for (let i = 0; i < 10; i++) {
      await storage.insert("cache", { id: `item-${i}`, data: largeValue });
    }

    const items = await storage.find("cache", {});

    // Should have evicted some items to stay under 1000 bytes
    expect(items.length).toBeLessThan(10);
    expect(items.length).toBeGreaterThan(0);

    const lastItem = await storage.findOne("cache", { id: "item-9" });
    expect(lastItem).toBeDefined();
  });

  test("should handle nested object size estimation", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate({
      cache: {
        id: { type: "string" },
        $memoryLimit: 500,
      },
    });

    const hugeObject = {
      nested: {
        a: "x".repeat(1000),
      },
    };

    await storage.insert("cache", { id: "huge", ...hugeObject });

    const item = await storage.findOne("cache", { id: "huge" });
    expect(item).toBeUndefined();
  });
});

describe("InMemoryStorage (Filtering and Operations)", () => {
  test("should support nested property filtering with space operators", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate({ test_table: {} });

    await storage.insert("test_table", { id: "1", metadata: { count: 10 } });
    await storage.insert("test_table", { id: "2", metadata: { count: 3 } });

    const results = await storage.find("test_table", {
      where: { "metadata.count >": 5 } as any,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("should support deep dot notation exact match", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate({ test_table: {} });

    await storage.insert("test_table", { id: "1", user: { profile: { name: "alice" } } });
    await storage.insert("test_table", { id: "2", user: { profile: { name: "bob" } } });

    const results = await storage.find("test_table", {
      where: { "user.profile.name": "alice" } as any,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("remove should not cascade to other tables", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate({ parent: {}, child: {} });

    await storage.insert("parent", { id: "p1" });
    await storage.insert("child", { id: "c1", parent_id: "p1" });

    // Explicitly delete only from parent
    await storage.remove("parent", { id: "p1" });

    const p = await storage.findOne("parent", { id: "p1" });
    expect(p).toBeUndefined();

    const c = await storage.findOne("child", { id: "c1" });
    expect(c).toBeDefined(); // Child should still exist
  });
});

