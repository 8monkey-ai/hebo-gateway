import { describe, expect, test, mock } from "bun:test";

import { SqlStorage } from "../sql";
import { PostgresDialect, PostgresDialectConfig, type PgPool } from "./postgres";

describe("Postgres Dialect (Mocked)", () => {
  const createMockPool = () => {
    const queries: { sql: string; params: unknown[] }[] = [];

    const query = mock((queryInput: string | { text: string; values?: unknown[] }) => {
      const text = typeof queryInput === "string" ? queryInput : queryInput.text;
      const values = typeof queryInput === "string" ? [] : (queryInput.values ?? []);

      queries.push({ sql: text, params: values });

      // Return a mock result
      if (text.trim().toUpperCase().startsWith("SELECT")) {
        if (text.includes('FROM "conversations"')) {
          return Promise.resolve({ rows: [{ id: "conv-1", created_at: Date.now() }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const pool = {
      query,
      connect: mock(() =>
        Promise.resolve({
          query,
          release: mock(() => {}),
        }),
      ),
    };

    return { pool, queries };
  };

  test("should generate correct SQL for conversation lifecycle", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new PostgresDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect });

    // 1. Create Conversation
    const metadata = { foo: "bar" };
    await storage.createConversation({ metadata });

    const insertConv = queries.find((q) => q.sql.includes('INSERT INTO "conversations"'));
    expect(insertConv).toBeDefined();
    // Verify Postgres specific: double quotes and $ placeholders
    expect(insertConv!.sql).toContain(
      'INSERT INTO "conversations" ("id", "metadata", "created_at") VALUES ($1, $2, $3)',
    );
    // Verify JSON mapping (pg natively supports JSON objects, so it doesn't
    // stringify)
    expect(insertConv!.params[1]).toEqual(metadata);
    // Verify Date mapping (should be number for BIGINT)
    expect(typeof insertConv!.params[2]).toBe("number");

    queries.length = 0; // Reset

    // 2. Add Items
    await storage.addItems("conv-1", [
      { id: "item-1", type: "message", role: "user", content: "hello" },
    ]);

    const insertItem = queries.find((q) => q.sql.includes('INSERT INTO "conversation_items"'));
    expect(insertItem).toBeDefined();
    expect(insertItem!.sql).toContain(
      'INSERT INTO "conversation_items" ("id", "conversation_id", "type", "data", "created_at") VALUES ($1, $2, $3, $4, $5)',
    );
    expect(pool.connect).toHaveBeenCalled();
  });

  test("should generate correct Postgres UPSERT syntax", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new PostgresDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect });

    await storage.updateConversation("conv-1", { updated: "true" });

    const upsertQuery = queries.find((q) => q.sql.includes("ON CONFLICT"));
    expect(upsertQuery).toBeDefined();
    // Postgres specific UPSERT syntax
    expect(upsertQuery!.sql).toContain(
      'ON CONFLICT ("id") DO UPDATE SET "metadata" = EXCLUDED."metadata"',
    );
  });

  test("should generate correct JSON extraction for Postgres", () => {
    const expression = PostgresDialectConfig.jsonExtract('c."metadata"', "user_id");
    // Postgres specific JSON extraction
    expect(expression).toBe(`c."metadata"->>'user_id'`);
  });
});
