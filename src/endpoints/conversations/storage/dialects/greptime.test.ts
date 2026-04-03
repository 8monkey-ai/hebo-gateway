import { describe, expect, test, mock } from "bun:test";
import { GrepTimeDialect, GrepTimeDialectConfig } from "./greptime";
import { type PgPool } from "./postgres";
import { SqlStorage } from "../sql";

describe("Greptime Dialect (Mocked)", () => {
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

  test("should generate correct Greptime-specific table creation queries", async () => {
    const { pool, queries } = createMockPool();
    const dialect = new GrepTimeDialect({ client: pool as unknown as PgPool });
    const storage = new SqlStorage({ dialect });

    await storage.migrate();

    const createConversations = queries.find((q) =>
      q.sql.includes('CREATE TABLE IF NOT EXISTS "conversations"'),
    );
    expect(createConversations).toBeDefined();
    // Verify Greptime specific: TIME INDEX and PARTITION clause
    expect(createConversations!.sql).toContain('TIME INDEX ("created_at")');
    expect(createConversations!.sql).toContain('PARTITION ON COLUMNS ("id")');
    // Verify 16 partitions are defined
    const expectedBoundaries = [
      "\"id\" < '1'",
      "\"id\" >= 'f'",
      "\"id\" >= '1' AND \"id\" < '2'",
      "\"id\" >= '2' AND \"id\" < '3'",
      "\"id\" >= '3' AND \"id\" < '4'",
      "\"id\" >= '4' AND \"id\" < '5'",
      "\"id\" >= '5' AND \"id\" < '6'",
      "\"id\" >= '6' AND \"id\" < '7'",
      "\"id\" >= '7' AND \"id\" < '8'",
      "\"id\" >= '8' AND \"id\" < '9'",
      "\"id\" >= '9' AND \"id\" < 'a'",
      "\"id\" >= 'a' AND \"id\" < 'b'",
      "\"id\" >= 'b' AND \"id\" < 'c'",
      "\"id\" >= 'c' AND \"id\" < 'd'",
      "\"id\" >= 'd' AND \"id\" < 'e'",
      "\"id\" >= 'e' AND \"id\" < 'f'",
    ];

    for (const boundary of expectedBoundaries) {
      expect(createConversations!.sql).toContain(boundary);
    }

    // Also verify the total count of commas in the partition clause to ensure no extra/missing ones
    const partitionMatch = createConversations!.sql.match(/PARTITION ON COLUMNS \("id"\) \((.*)\)/);
    expect(partitionMatch).toBeDefined();
    const partitions = partitionMatch![1]!.split(",");
    expect(partitions.length).toBe(16);

    const createItems = queries.find((q) =>
      q.sql.includes('CREATE TABLE IF NOT EXISTS "conversation_items"'),
    );
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

    const insertConv = queries.find((q) => q.sql.includes('INSERT INTO "conversations"'));
    expect(insertConv).toBeDefined();

    // JSON using pg driver should be wrapped in Uint8Array
    expect(insertConv!.params[1] instanceof Uint8Array).toBe(true);
    const decodedJson = new TextDecoder().decode(insertConv!.params[1] as Uint8Array);
    expect(decodedJson).toBe(JSON.stringify(metadata));

    // Date using pg driver should be a specific string format
    expect(typeof insertConv!.params[2]).toBe("string");
    expect(insertConv!.params[2] as string).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/);
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
