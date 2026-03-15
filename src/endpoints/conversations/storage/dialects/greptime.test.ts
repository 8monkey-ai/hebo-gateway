import { describe, expect, test, mock } from "bun:test";
import { GrepTimeDialect, GrepTimeDialectConfig } from "./greptime";
import { type PgPool } from "./postgres";
import { SqlStorage } from "../sql";

describe("Greptime Dialect (Mocked)", () => {
  const createMockPool = () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    
    const query = mock((queryObj: { text: string; values?: unknown[] }) => {
      queries.push({ sql: queryObj.text, params: queryObj.values ?? [] });
      // Return a mock result
      if (queryObj.text.trim().toUpperCase().startsWith("SELECT")) {
        if (queryObj.text.includes('FROM "conversations"')) {
          return Promise.resolve({ rows: [{ id: "conv-1", created_at: Date.now() }], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const pool = {
      query,
      connect: mock(() => Promise.resolve({
        query,
        release: mock(() => {}),
      })),
    };

    return { pool, queries };
  };

  test("should generate correct Greptime-specific table creation queries", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new GrepTimeDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect });

    await storage.migrate();

    const createConversations = queries.find(q => q.sql.includes('CREATE TABLE IF NOT EXISTS "conversations"'));
    expect(createConversations).toBeDefined();
    // Verify Greptime specific: TIME INDEX and PARTITION clause
    expect(createConversations!.sql).toContain('TIME INDEX ("created_at")');
    expect(createConversations!.sql).toContain('PARTITION ON COLUMNS ("id")');

    const createItems = queries.find(q => q.sql.includes('CREATE TABLE IF NOT EXISTS "conversation_items"'));
    expect(createItems).toBeDefined();
    // Verify Greptime specific: SKIPPING INDEX
    expect(createItems!.sql).toContain('"id" VARCHAR(255) SKIPPING INDEX');
  });

  test("should map parameters correctly for Greptime (PgPool driver)", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new GrepTimeDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect });

    const metadata = { user: "greptime" };
    await storage.createConversation({ metadata });

    const insertConv = queries.find(q => q.sql.includes('INSERT INTO "conversations"'));
    expect(insertConv).toBeDefined();
    
    // JSON using pg driver should be wrapped in Uint8Array
    expect(insertConv!.params[1] instanceof Uint8Array).toBe(true);
    const decodedJson = new TextDecoder().decode(insertConv!.params[1] as Uint8Array);
    expect(decodedJson).toBe(JSON.stringify(metadata));

    // Date using pg driver should be a specific string format
    expect(typeof insertConv!.params[2]).toBe("string");
    expect((insertConv!.params[2] as string)).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  test("should generate correct Greptime JSON extraction and SELECT casts", () => {
    // Check JSON Select Cast (to prevent rust-style unicode bugs)
    const selectCast = GrepTimeDialectConfig.selectJson('c."metadata"');
    expect(selectCast).toBe('c."metadata"::STRING');

    // Check JSON extraction (uses custom json_get_string function)
    const extract = GrepTimeDialectConfig.jsonExtract('c."metadata"', "user_id");
    expect(extract).toBe(`json_get_string(c."metadata", 'user_id')`);
  });
});
