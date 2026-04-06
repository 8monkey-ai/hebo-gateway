import { describe, expect, test } from "bun:test";
import { InMemoryStorage } from "./memory";

describe("InMemoryStorage (Size-Based LRU)", () => {
  test("should evict items based on estimated byte size", async () => {
    const storage = new InMemoryStorage();
    storage.$extends({
      schema: {
        cache: {
          id: { type: "string" },
          $memoryLimit: 1000, // Very small limit (1KB)
        },
      },
    });
    await storage.migrate();

    // Each item is ~200 bytes (string "a" repeated 100 times)
    const largeValue = "a".repeat(100);

    // Insert 10 items (Total ~2000 bytes, should trigger eviction)
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(storage.cache.create({ id: `item-${i}`, data: largeValue }));
    }
    await Promise.all(promises);

    const items = await storage.cache.findMany({});

    // Should have evicted some items to stay under 1000 bytes
    expect(items.length).toBeLessThan(10);
    expect(items.length).toBeGreaterThan(0);

    const lastItem = await storage.cache.findFirst({ id: "item-9" });
    expect(lastItem).toBeDefined();
  });

  test("should handle nested object size estimation", async () => {
    const storage = new InMemoryStorage();
    storage.$extends({
      schema: {
        cache: {
          id: { type: "string" },
          $memoryLimit: 500,
        },
      },
    });
    await storage.migrate();

    const hugeObject = {
      nested: {
        a: "x".repeat(1000),
      },
    };

    await storage.cache.create({ id: "huge", ...hugeObject });

    const item = await storage.cache.findFirst({ id: "huge" });
    expect(item).toBeUndefined();
  });
});

describe("InMemoryStorage (Filtering and Operations)", () => {
  test("should support nested property filtering with structured operators", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate();

    await storage.test_table.create({ id: "1", metadata: { count: 10 } });
    await storage.test_table.create({ id: "2", metadata: { count: 3 } });

    const results = await storage.test_table.findMany({
      where: { metadata: { count: { gt: 5 } } } as any,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("should support deep dot notation exact match", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate();

    await storage.test_table.create({ id: "1", user: { profile: { name: "alice" } } });
    await storage.test_table.create({ id: "2", user: { profile: { name: "bob" } } });

    const results = await storage.test_table.findMany({
      where: { user: { profile: { name: "alice" } } } as any,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  test("delete should not cascade to other tables", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate();

    await storage.parent.create({ id: "p1" });
    await storage.child.create({ id: "c1", parent_id: "p1" });

    // Explicitly delete only from parent
    await storage.parent.delete({ id: "p1" });

    const p = await storage.parent.findFirst({ id: "p1" });
    expect(p).toBeUndefined();

    const c = await storage.child.findFirst({ id: "c1" });
    expect(c).toBeDefined(); // Child should still exist
  });

  test("should generate uuidv7 fallback IDs and maintain chronological sorting", async () => {
    const storage = new InMemoryStorage();
    await storage.migrate();

    // Create 5 items without explicit IDs, with small delays to ensure different uuidv7 timestamps
    const createPromises = [];
    for (let i = 0; i < 5; i++) {
      createPromises.push(
        new Promise<void>((r) => {
          setTimeout(async () => {
            await storage.items.create({ data: `item-${i}` });
            r();
          }, i * 2);
        }),
      );
    }
    await Promise.all(createPromises);

    // List items - they should be sorted by ID (the fallback uuidv7) by default or as tie-breaker
    const results = await storage.items.findMany({
      orderBy: { id: "asc" },
    });

    expect(results).toHaveLength(5);
    // Even without explicit IDs, they should be in the order they were created
    for (let i = 0; i < 5; i++) {
      expect(results[i].data).toBe(`item-${i}`);
    }
  });
});
