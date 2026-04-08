import { describe, expect, test } from "bun:test";
import { PostgresDialect, type PgPool } from "./postgres";
import { SqlStorage } from "../sql";
import { conversationExtension } from "../../endpoints/conversations/extension";
import type { WhereCondition } from "../types";

describe("Postgres Dialect (Mocked)", () => {
  const setup = () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const pool = {
      connect: () =>
        Promise.resolve({
          query: (arg: string | { text: string; values?: unknown[] }) => {
            const sql = typeof arg === "string" ? arg : arg.text;
            const params = typeof arg === "string" ? [] : (arg.values ?? []);
            queries.push({ sql, params });
            if (sql.includes("SELECT")) {
              return Promise.resolve({
                rows: [{ id: "conv-1", created_at: Date.now(), metadata: "{}" }],
              });
            }
            return Promise.resolve({ rows: [] });
          },
          release: () => {},
        }),
      query: (arg: string | { text: string; values?: unknown[] }) => {
        const sql = typeof arg === "string" ? arg : arg.text;
        const params = typeof arg === "string" ? [] : (arg.values ?? []);
        queries.push({ sql, params });
        if (sql.includes("SELECT")) {
          return Promise.resolve({
            rows: [{ id: "conv-1", created_at: Date.now(), metadata: "{}" }],
          });
        }
        return Promise.resolve({ rows: [] });
      },
    };

    const dialect = new PostgresDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect }).$extends(conversationExtension);
    return { storage, queries, pool };
  };

  test("should generate correct SQL for conversation lifecycle", async () => {
    const { storage, queries } = setup();
    await storage.migrate();
    const metadata = { user_id: "123" };

    // 1. Create
    await storage.conversations.create({ metadata });

    const insertConv = queries.find((q) => q.sql?.includes('INSERT INTO "conversations"'));
    expect(insertConv).toBeDefined();
    expect(insertConv!.sql).toContain('"id"');
    expect(insertConv!.sql).toContain('"metadata"');
    expect(insertConv!.sql).toContain('"created_at"');
    expect(insertConv!.params).toHaveLength(3);

    // 2. Add Items
    await storage.conversation_items.create({
      id: "item-1",
      type: "message",
      role: "user",
      content: "hello",
      conversation_id: "conv-1",
    });

    const insertItem = queries.find((q) => q.sql?.includes('INSERT INTO "conversation_items"'));
    expect(insertItem).toBeDefined();
    expect(insertItem!.sql).toContain('"id"');
    expect(insertItem!.sql).toContain('"conversation_id"');
    expect(insertItem!.sql).toContain('"type"');
    expect(insertItem!.sql).toContain('"data"');
  });

  test("should generate correct Postgres UPSERT syntax", async () => {
    const { storage, queries } = setup();
    await storage.migrate();

    await storage.conversations.update("conv-1", { metadata: { updated: "true" } });

    const upsertQuery = queries.find((q) => q.sql?.includes("INSERT INTO"));
    expect(upsertQuery).toBeDefined();
    expect(upsertQuery!.sql).toContain('ON CONFLICT ("id") DO UPDATE SET');
  });

  test("should generate correct JSON extraction for Postgres", async () => {
    const { storage, queries } = setup();
    await storage.migrate();

    await storage.conversations.findMany({
      where: { "metadata.user_id": "123" } as WhereCondition<unknown>,
    });

    const listQuery = queries.find((q) => q.sql?.includes("SELECT * FROM"));
    expect(listQuery).toBeDefined();
    // Accept either $1 or $2 depending on internal query builder state
    expect(listQuery!.sql).toMatch(/"metadata"#>>'\{"user_id"\}' = \$[12]/);
  });
});
